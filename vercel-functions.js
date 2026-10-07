// ============================================
// PORTALE RENTRI - Vercel Functions
// ============================================

// ============================================
// 1. CRON AUTOMATICA - /api/cron/send-notifications.js
// ============================================
// Esegui ogni notte a 9:00 AM (UTC)
// Configurazione in vercel.json:
// {
//   "crons": [{
//     "path": "/api/cron/send-notifications",
//     "schedule": "0 9 * * *"
//   }]
// }

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function sendEmailViaBrevo(clientEmail, clientName, fileWordUrl) {
  const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: [{ email: clientEmail, name: clientName }],
      sender: { email: 'noreply@tuodominio.it', name: 'RENTRI - Notifiche Rifiuti' },
      subject: `RENTRI ${clientName} - Notifica scadenza obblighi`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Notifica RENTRI - ${clientName}</h2>
          <p>Egregio/a,</p>
          <p>Ti comunichiamo che la scadenza per il caricamento dei dati RENTRI è imminente.</p>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Azioni richieste:</strong></p>
            <ol>
              <li>Scaricare i codici allegati (file Word)</li>
              <li>Verificare i dati relativi ai rifiuti</li>
              <li>Inviare entro il termine previsto</li>
            </ol>
          </div>

          <p><strong>File allegati:</strong> ${fileWordUrl ? `<a href="${fileWordUrl}">Scarica codici</a>` : 'N/A'}</p>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            Questa è una comunicazione automatica da RENTRI.<br>
            Per informazioni contattare: info@tuodominio.it
          </p>
        </div>
      `
    })
  });

  if (!brevoResponse.ok) {
    const error = await brevoResponse.json();
    throw new Error(`Brevo error: ${error.message}`);
  }

  const brevoData = await brevoResponse.json();
  return brevoData.messageId;
}

export default async (req, res) => {
  try {
    console.log('[CRON] Starting notification cron...');

    // 1. Fetch tutti i clienti attivi
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select(`
        id,
        ragione_sociale,
        email,
        telefono,
        data_primo_carico,
        frequenza_giorni,
        file_word_url
      `)
      .eq('status', 'attivo');

    if (clientsError) throw clientsError;
    if (!clients || clients.length === 0) {
      console.log('[CRON] No active clients found');
      return res.status(200).json({ message: 'No clients to process' });
    }

    let sent = 0;
    let failed = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 2. Loop su ogni cliente
    for (const client of clients) {
      try {
        // Calcola prossima data scadenza
        const firstLoadDate = new Date(client.data_primo_carico);
        const nextDeadline = new Date(firstLoadDate);
        nextDeadline.setDate(nextDeadline.getDate() + client.frequenza_giorni);
        nextDeadline.setHours(0, 0, 0, 0);

        // Cerca ultima notifica inviata
        const { data: lastNotif } = await supabase
          .from('notifications')
          .select('data_invio_effettiva')
          .eq('client_id', client.id)
          .eq('status', 'sent')
          .order('data_invio_effettiva', { ascending: false })
          .limit(1)
          .single();

        let shouldSend = false;
        if (!lastNotif) {
          // Mai inviata: invia se scadenza è passata o entro 7 giorni
          shouldSend = nextDeadline <= today ||
            (nextDeadline - today) / (1000 * 60 * 60 * 24) <= 7;
        } else {
          // Controlla se è passato il tempo dalla ultima notifica
          const daysSinceLastSend =
            (today - new Date(lastNotif.data_invio_effettiva)) / (1000 * 60 * 60 * 24);
          shouldSend = daysSinceLastSend >= client.frequenza_giorni;
        }

        if (shouldSend) {
          console.log(`[CRON] Sending to ${client.ragione_sociale} (${client.email})`);

          // Invia via Brevo
          const messageId = await sendEmailViaBrevo(
            client.email,
            client.ragione_sociale,
            client.file_word_url
          );

          // Registra su notifications
          await supabase.from('notifications').insert({
            client_id: client.id,
            data_invio_effettiva: new Date().toISOString(),
            status: 'sent',
            tipo_invio: 'auto',
            brevo_message_id: messageId
          });

          sent++;
          console.log(`[CRON] ✓ Sent to ${client.ragione_sociale}`);
        }

      } catch (err) {
        console.error(`[CRON] ✗ Failed for client ${client.id}:`, err.message);
        failed++;

        // Registra fallimento
        await supabase.from('notifications').insert({
          client_id: client.id,
          status: 'failed',
          tipo_invio: 'auto',
          error_message: err.message
        });
      }
    }

    console.log(`[CRON] Completed: ${sent} sent, ${failed} failed`);
    return res.status(200).json({
      success: true,
      sent,
      failed,
      total: clients.length
    });

  } catch (error) {
    console.error('[CRON] Fatal error:', error);
    return res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};


// ============================================
// 2. INVIO MANUALE - /api/send-notification-manual.js
// ============================================
// POST /api/send-notification-manual
// Body: { client_id: number }

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseManual = createSupabaseClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function sendEmailViaBrevoManual(clientEmail, clientName, fileWordUrl) {
  const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: [{ email: clientEmail, name: clientName }],
      sender: { email: 'noreply@tuodominio.it', name: 'RENTRI - Notifiche Rifiuti' },
      subject: `RENTRI ${clientName} - Notifica manuale`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Notifica RENTRI (Invio Manuale) - ${clientName}</h2>
          <p>Notifica inviata manualmente il ${new Date().toLocaleDateString('it-IT')}</p>
          <p>File allegati disponibili: ${fileWordUrl ? '<a href="' + fileWordUrl + '">Scarica</a>' : 'N/A'}</p>
        </div>
      `
    })
  });

  if (!brevoResponse.ok) {
    const error = await brevoResponse.json();
    throw new Error(`Brevo error: ${error.message}`);
  }

  const brevoData = await brevoResponse.json();
  return brevoData.messageId;
}

export default async (req, res) => {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { client_id } = req.body;

    if (!client_id) {
      return res.status(400).json({ error: 'client_id required' });
    }

    // Fetch client
    const { data: client, error: clientError } = await supabaseManual
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    console.log(`[MANUAL] Sending to ${client.ragione_sociale}`);

    // Invia via Brevo
    const messageId = await sendEmailViaBrevoManual(
      client.email,
      client.ragione_sociale,
      client.file_word_url
    );

    // Registra su notifications
    const { data: notif, error: notifError } = await supabaseManual
      .from('notifications')
      .insert({
        client_id: client.id,
        data_invio_effettiva: new Date().toISOString(),
        status: 'sent',
        tipo_invio: 'manuale',
        brevo_message_id: messageId
      })
      .select()
      .single();

    if (notifError) throw notifError;

    console.log(`[MANUAL] ✓ Sent to ${client.ragione_sociale}`);

    return res.status(200).json({
      success: true,
      client_id,
      notification_id: notif.id,
      message: `Email inviata a ${client.ragione_sociale}`
    });

  } catch (error) {
    console.error('[MANUAL] Error:', error);
    return res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};


// ============================================
// 3. VERIFICA STATO EMAIL (webhook Brevo) - OPZIONALE
// /api/webhook/brevo-status.js
// ============================================
// Registra questo URL in Brevo Dashboard → Settings → Webhooks
// https://tuodominio.vercel.app/api/webhook/brevo-status

import { createClient as createSupabaseWebhook } from '@supabase/supabase-js';

const supabaseWebhook = createSupabaseWebhook(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    const messageId = event['message-id'];

    if (!messageId) {
      return res.status(400).json({ error: 'message-id required' });
    }

    // Trova notification per message ID
    const { data: notif } = await supabaseWebhook
      .from('notifications')
      .select('id, status')
      .eq('brevo_message_id', messageId)
      .single();

    if (!notif) {
      console.log(`[WEBHOOK] No notification found for ${messageId}`);
      return res.status(200).json({ status: 'ok' });
    }

    // Map Brevo event → status
    let newStatus = notif.status;
    if (event.event === 'bounce' || event.event === 'complaint') {
      newStatus = 'bounced';
    } else if (event.event === 'delivered') {
      newStatus = 'sent';
    }

    // Update
    await supabaseWebhook
      .from('notifications')
      .update({ status: newStatus })
      .eq('id', notif.id);

    console.log(`[WEBHOOK] Updated notification ${notif.id}: ${newStatus}`);

    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('[WEBHOOK] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

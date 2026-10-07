# Portale RENTRI - Guida Implementazione

**Data**: 7 ottobre 2026  
**Versione**: 1.0  
**Stack**: Vercel + Supabase + Brevo  

---

## 📋 Checklist Setup

### Fase 1: Supabase (Database)

- [ ] Vai su https://supabase.com → Login al tuo progetto
- [ ] Vai a **SQL Editor**
- [ ] Copia e incolla il contenuto di `rentri-schema.sql`
- [ ] Esegui (Play button in alto a destra)
- [ ] Verifica che tabelle `clients` e `notifications` siano create
- [ ] Annota `SUPABASE_URL` e `SUPABASE_KEY` (Settings → API)

**Note importanti:**
- `SUPABASE_URL` → "Project URL"
- `SUPABASE_KEY` → "anon public key"
- **NON usare Service Role Key** (questa è secret)

---

### Fase 2: Brevo (Email Service)

- [ ] Vai a https://www.brevo.com → Login/Registrati
- [ ] Vai a **Settings** → **SMTP & API**
- [ ] Copia l'**API Key** (REST API v3)
- [ ] Annota: `BREVO_API_KEY`

**Test email:**
```bash
curl -X POST "https://api.brevo.com/v3/smtp/email" \
  -H "api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": [{"email": "test@tuodominio.it"}],
    "sender": {"name": "RENTRI", "email": "noreply@tuodominio.it"},
    "subject": "Test",
    "htmlContent": "<h1>Test</h1>"
  }'
```

---

### Fase 3: Vercel (Hosting + Functions)

#### 3.1 Setup progetto

```bash
# Clona il repo (o crea nuovo)
cd portale-rentri
npm init -y

# Install dipendenze
npm install @supabase/supabase-js

# Crea struttura
mkdir -p api/cron
mkdir -p api/webhook
mkdir -p public
```

#### 3.2 Copia files

```bash
# Copia le functions
cp vercel-functions.js → api/cron/send-notifications.js (prima funzione)
cp vercel-functions.js → api/send-notification-manual.js (seconda funzione)
cp vercel-functions.js → api/webhook/brevo-status.js (terza funzione)

# Copia config
cp vercel.json .
cp .env.example .env.local
```

#### 3.3 Configura .env.local

Edita `.env.local`:
```env
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_KEY=eyJhbcde...
BREVO_API_KEY=xkeysib_...
```

#### 3.4 Deploy a Vercel

**Opzione A: CLI (consigliato)**
```bash
npm install -g vercel
vercel login
vercel
# Segui wizard → Deploy
```

**Opzione B: GitHub**
- Push su GitHub
- Vai a https://vercel.com → Connect GitHub repo
- Configura env vars (stesso contenuto di .env.local)
- Deploy

#### 3.5 Verifica Cron

Dopo deploy:
- Vai a **Vercel Dashboard** → Project → **Crons**
- Dovresti vedere `/api/cron/send-notifications` schedulata a 9 AM UTC
- Puoi testare manualmente cliccando **Run Cron** (oppure aspetta domani mattina)

---

### Fase 4: Portale Frontend

#### 4.1 Aggiorna il portale HTML

Nel portale (`index.html`), aggiungi questa funzione:

```javascript
// Nel <head> o prima di chiudere </body>
const SUPABASE_URL = 'https://xyz.supabase.co';
const SUPABASE_KEY = 'eyJhbcde...'; // anon key

// Importa Supabase
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function addClientToSupabase(e) {
  e.preventDefault();
  
  const ragioneSociale = document.getElementById('ragioneSociale').value;
  const email = document.getElementById('email').value;
  const telefono = document.getElementById('telefono').value;
  const dataCarico = document.getElementById('dataCarico').value;
  const frequenza = parseInt(document.getElementById('frequenza').value);
  const fileWord = document.getElementById('fileWord').files[0];

  if (!fileWord) {
    alert('Seleziona un file Word');
    return;
  }

  try {
    // 1. Upload file su Storage
    const fileName = `${Date.now()}-${fileWord.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('rentri-documents')
      .upload(`clients/${ragioneSociale}/${fileName}`, fileWord);

    if (uploadError) throw uploadError;

    // 2. Get file public URL
    const { data: publicUrlData } = supabase.storage
      .from('rentri-documents')
      .getPublicUrl(`clients/${ragioneSociale}/${fileName}`);

    // 3. Insert cliente in DB
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .insert({
        ragione_sociale: ragioneSociale,
        email: email,
        telefono: telefono,
        data_primo_carico: dataCarico,
        frequenza_giorni: frequenza,
        file_word_url: publicUrlData.publicUrl,
        file_word_path: uploadData.path,
        status: 'attivo'
      })
      .select()
      .single();

    if (clientError) throw clientError;

    alert(`✓ Cliente "${ragioneSociale}" aggiunto al sistema!`);
    document.getElementById('clientForm').reset();
    loadClientsFromSupabase();

  } catch (error) {
    console.error('Error:', error);
    alert(`✗ Errore: ${error.message}`);
  }
}

async function sendMailManual(clientId) {
  try {
    const response = await fetch('/api/send-notification-manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId })
    });

    const data = await response.json();
    if (response.ok) {
      alert(`✓ ${data.message}`);
      loadClientsFromSupabase();
    } else {
      alert(`✗ ${data.error}`);
    }
  } catch (error) {
    console.error('Error:', error);
    alert(`✗ Errore: ${error.message}`);
  }
}

async function loadClientsFromSupabase() {
  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select(`
        id,
        ragione_sociale,
        email,
        data_primo_carico,
        frequenza_giorni,
        notifications(data_invio_effettiva, status, risposta_ricevuta)
      `)
      .eq('status', 'attivo');

    if (error) throw error;

    const tbody = document.getElementById('tableBody');
    
    if (!clients || clients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">Nessun cliente</td></tr>';
      return;
    }

    tbody.innerHTML = clients.map(client => {
      // Calcola giorni fino scadenza
      const firstLoad = new Date(client.data_primo_carico);
      const deadline = new Date(firstLoad);
      deadline.setDate(deadline.getDate() + client.frequenza_giorni);
      const daysLeft = Math.ceil((deadline - new Date()) / (1000*60*60*24));
      
      const lastNotif = client.notifications?.[0];
      const hasReply = lastNotif?.risposta_ricevuta ? 'checked' : '';

      return `
        <tr>
          <td><strong>${client.ragione_sociale}</strong></td>
          <td><span class="days-badge ${daysLeft <= 7 ? 'urgent' : ''}">${daysLeft > 0 ? daysLeft + 'gg' : 'Scaduto'}</span></td>
          <td>${client.email}</td>
          <td>${lastNotif?.data_invio_effettiva ? new Date(lastNotif.data_invio_effettiva).toLocaleDateString('it-IT') : '—'}</td>
          <td class="checkbox-cell"><input type="checkbox" ${hasReply}></td>
          <td>
            <button onclick="sendMailManual(${client.id})" style="padding: 6px 12px; font-size: 11px; width: auto;">📧 Invia</button>
            <button style="padding: 6px 12px; font-size: 11px; width: auto; background: #e74c3c;" onclick="deleteClient(${client.id})">🗑</button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading clients:', error);
  }
}

// Carica clienti al boot
window.addEventListener('DOMContentLoaded', loadClientsFromSupabase);
```

#### 4.2 Aggiungi CDN Supabase

Nel `<head>` del portale HTML:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

---

### Fase 5: Storage Supabase (File Word)

- [ ] Vai a Supabase → **Storage**
- [ ] Clicca **Create new bucket**
- [ ] Nome: `rentri-documents`
- [ ] Visibility: **Public**
- [ ] Clicca **Create**

---

### Fase 6: Test End-to-End

#### Test Cron manuale
```bash
curl -X POST https://tuodominio.vercel.app/api/cron/send-notifications
```

Dovrebbe rispondere:
```json
{
  "success": true,
  "sent": 1,
  "failed": 0,
  "total": 1
}
```

#### Test invio manuale
```bash
curl -X POST https://tuodominio.vercel.app/api/send-notification-manual \
  -H "Content-Type: application/json" \
  -d '{"client_id": 1}'
```

#### Test portale
1. Apri portale
2. Aggiungi cliente di test
3. Clicca "📧 Invia"
4. Controlla email (dovrebbe arrivare in 30 secondi)

---

## 🚀 Deployment Vercel (Quick)

```bash
git add .
git commit -m "Add RENTRI portal"
git push

# Oppure via CLI
npm install -g vercel
vercel --prod
```

Dopodiché:
1. Vai a https://vercel.com/dashboard
2. Seleziona il progetto
3. **Settings** → **Environment Variables**
4. Aggiungi:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `BREVO_API_KEY`
5. Redeploy (Deployments → Redeploy)

---

## 📧 Test Email Brevo

**Via Brevo Dashboard:**
- Settings → **SMTP Test**
- O usa il curl command sopra

**Email di test via portale:**
1. Aggiungi cliente con email: `test@tuodominio.it`
2. Clicca "Invia"
3. Controlla inbox in 30 secondi

---

## 🔧 Troubleshooting

### Cron non gira
- Verifica in Vercel → Crons tab che sia schedulata
- Check logs: Vercel Dashboard → Project → Logs
- Prova manualmente: `curl https://tuodominio.vercel.app/api/cron/send-notifications`

### Email non arrivano
- Verifica BREVO_API_KEY in .env
- Check Brevo logs: https://app.brevo.com/account/transactional/log
- Test semplice con curl (vedi sopra)

### Errore Supabase
- Verifica SUPABASE_URL e SUPABASE_KEY (non service key!)
- Check Supabase logs: https://app.supabase.com → Project → Logs

### File upload fallisce
- Verifica bucket `rentri-documents` esista
- Check permissions: Storage → Policies

---

## 📞 Note Finali

- **Email address mittente**: Configura in `FROM_EMAIL` (.env)
- **Rate limit Brevo**: 300/giorno free → perfetto per 20 mail/giorno
- **Backup**: Esporta dati Supabase regolarmente
- **Testing**: Prima di produzione, testa con email di test

---

**Pronto?** Procedi con:
1. Copia schema SQL su Supabase ✓
2. Configura Brevo API ✓
3. Deploy functions su Vercel ✓
4. Integra portale con Supabase ✓
5. Test end-to-end ✓

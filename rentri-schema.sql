-- PORTALE RENTRI - Schema Database (Supabase)
-- Esegui questi comandi nel SQL Editor di Supabase

-- Abilita RLS
ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO postgres;

-- ============================================
-- TABELLA CLIENTI
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  ragione_sociale VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  telefono VARCHAR(20),
  data_primo_carico DATE NOT NULL,
  frequenza_giorni INT DEFAULT 30 CHECK (frequenza_giorni > 0),
  file_word_url TEXT,
  file_word_path TEXT,
  status VARCHAR(20) DEFAULT 'attivo' CHECK (status IN ('attivo', 'sospeso', 'inattivo')),
  note TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_status ON clients(status);

-- ============================================
-- TABELLA NOTIFICHE (STORICO INVII)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  data_invio_prevista DATE,
  data_invio_effettiva TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  risposta_ricevuta BOOLEAN DEFAULT false,
  data_risposta TIMESTAMP,
  tipo_invio VARCHAR(20) DEFAULT 'auto' CHECK (tipo_invio IN ('auto', 'manuale')),
  brevo_message_id VARCHAR(255),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_notifications_client_id ON notifications(client_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_data_invio ON notifications(data_invio_effettiva);
CREATE INDEX idx_notifications_tipo_invio ON notifications(tipo_invio);

-- ============================================
-- FUNZIONE TRIGGER - aggiorna updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VISTA - PROSSIME SCADENZE
-- ============================================
CREATE OR REPLACE VIEW v_scadenze_prossime AS
SELECT
  c.id,
  c.ragione_sociale,
  c.email,
  c.telefono,
  c.data_primo_carico,
  c.frequenza_giorni,
  c.file_word_url,
  MAX(n.data_invio_effettiva)::DATE as ultima_notifica,
  CAST(c.data_primo_carico AS DATE) + (c.frequenza_giorni * INTERVAL '1 day') as data_scadenza,
  CAST(c.data_primo_carico AS DATE) + (c.frequenza_giorni * INTERVAL '1 day') - CAST(NOW() AS DATE) as giorni_rimanenti,
  CASE
    WHEN CAST(c.data_primo_carico AS DATE) + (c.frequenza_giorni * INTERVAL '1 day') <= CAST(NOW() AS DATE) THEN 'scaduto'
    WHEN CAST(c.data_primo_carico AS DATE) + (c.frequenza_giorni * INTERVAL '1 day') - CAST(NOW() AS DATE) <= 7 THEN 'urgente'
    ELSE 'programmato'
  END as urgenza
FROM clients c
LEFT JOIN notifications n ON c.id = n.client_id AND n.status = 'sent'
WHERE c.status = 'attivo'
GROUP BY c.id
ORDER BY data_scadenza ASC;

-- ============================================
-- VISTA - STATISTICHE CLIENTI
-- ============================================
CREATE OR REPLACE VIEW v_stats_clienti AS
SELECT
  COUNT(DISTINCT c.id) as total_clienti,
  COUNT(DISTINCT CASE WHEN vsp.urgenza = 'scaduto' THEN c.id END) as clienti_scaduti,
  COUNT(DISTINCT CASE WHEN vsp.urgenza = 'urgente' THEN c.id END) as clienti_urgenti,
  COUNT(DISTINCT CASE WHEN n.risposta_ricevuta = true THEN c.id END) as clienti_con_risposta,
  COUNT(n.id) as total_notifiche_inviate
FROM clients c
LEFT JOIN v_scadenze_prossime vsp ON c.id = vsp.id
LEFT JOIN notifications n ON c.id = n.client_id AND n.status = 'sent'
WHERE c.status = 'attivo';

-- ============================================
-- SAMPLE DATA (opzionale - per test)
-- ============================================
-- INSERT INTO clients (ragione_sociale, email, telefono, data_primo_carico, frequenza_giorni, note)
-- VALUES
--   ('Acme S.r.l.', 'info@acme.it', '+39 333 1234567', NOW()::DATE - 45, 30, 'Cliente prioritario'),
--   ('Beta Consulting', 'contact@beta.it', '+39 333 9876543', NOW()::DATE - 20, 15, NULL);

-- ============================================
-- PERMESSI RLS (se attivi)
-- ============================================
-- ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Public access clients" ON clients FOR SELECT USING (true);
-- CREATE POLICY "Public access notifications" ON notifications FOR SELECT USING (true);

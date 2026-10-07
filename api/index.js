export default function handler(req, res) {
  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portale RENTRI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    .header {
      background: white;
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header h1 { color: #333; font-size: 28px; margin-bottom: 10px; }
    .header p { color: #666; font-size: 14px; }
    .status {
      margin-top: 15px;
      padding: 12px;
      background: #d4edda;
      color: #155724;
      border-radius: 6px;
      font-weight: 500;
      font-size: 14px;
    }
    .card {
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      text-align: center;
    }
    .card h2 { color: #333; margin-bottom: 15px; font-size: 24px; }
    .card p { color: #666; margin-bottom: 20px; font-size: 16px; }
    button {
      background: #667eea;
      color: white;
      padding: 12px 30px;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.3s;
    }
    button:hover { background: #5568d3; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Portale RENTRI</h1>
      <p>Gestione centralizzata clienti, scadenze notifiche e storico comunicazioni</p>
      <div class="status">✅ PORTALE ONLINE E FUNZIONANTE</div>
    </div>
    <div class="card">
      <h2>🚀 Portale RENTRI Pronto!</h2>
      <p>Se vedi questa pagina formattata con i colori, Vercel sta servendo correttamente i file HTML!</p>
      <button onclick="alert('✅ Portale RENTRI funziona correttamente!')">Test Portale</button>
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}

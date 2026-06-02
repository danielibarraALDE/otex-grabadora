var CLIENT_ID     = '813620033731-e8a43le1r3vvj265cm6oeu2vgqotlne6.apps.googleusercontent.com';
var FOLDER_ID     = '1JW4GpbPTbJIOJ6YYUUu9tYlKRt1CNHSM';
var PORTAL_SCRIPT = 'https://script.google.com/macros/s/AKfycbxs3BvZ_TcYvggDgPGX5JU01hmfkVM70Cz-ixJaOET-WQfelpSgdIrfZC9n-DKZK4UA/exec';

var mediaRecorder;
var chunks    = [];
var recTimer  = null;
var recStart  = null;
var tokenClient;
var accessToken = null;

document.getElementById('btn-iniciar').addEventListener('click', iniciar);
document.getElementById('btn-detener').addEventListener('click', detener);

// Cargar Google Identity Services
window.onload = function() {
  var script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.onload = function() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: function(response) {
        if (response.error) {
          mostrarError('Error de autorizacion: ' + response.error);
          return;
        }
        accessToken = response.access_token;
        setStatus('Autorizado. Presione "Iniciar Grabacion" para comenzar.', '');
        document.getElementById('btn-iniciar').disabled = false;
      }
    });
    // Solicitar token al cargar
    document.getElementById('btn-iniciar').disabled = true;
    setStatus('Solicitando autorizacion de Google...', '');
    tokenClient.requestAccessToken({ prompt: 'consent' });
  };
  document.head.appendChild(script);
};

async function iniciar() {
  try {
    var stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    var vid    = document.getElementById('preview');
    vid.srcObject = stream;
    chunks = [];

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = enviarVideo;
    mediaRecorder.start();

    recStart = Date.now();
    recTimer = setInterval(function() {
      var s  = Math.floor((Date.now() - recStart) / 1000);
      var mm = String(Math.floor(s / 60)).padStart(2, '0');
      var ss = String(s % 60).padStart(2, '0');
      setStatus('Grabando... ' + mm + ':' + ss, 'grabando');
    }, 1000);

    document.getElementById('btn-iniciar').disabled = true;
    document.getElementById('btn-detener').disabled = false;
    setStatus('Grabando...', 'grabando');

  } catch(err) {
    mostrarError('No se pudo acceder a la camara: ' + err.message);
  }
}

function detener() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  clearInterval(recTimer);
  document.getElementById('btn-detener').disabled = true;
  var stream = document.getElementById('preview').srcObject;
  if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
  setStatus('Procesando video...', 'subiendo');
}

async function enviarVideo() {
  var blob    = new Blob(chunks, { type: 'video/webm' });
  var totalMB = (blob.size / 1024 / 1024).toFixed(1);
  var nombre  = 'entrega_' + new Date().toISOString().replace(/[:.]/g, '-') + '.webm';

  var vid = document.getElementById('preview');
  vid.srcObject = null;
  vid.src       = URL.createObjectURL(blob);
  vid.controls  = true;
  vid.muted     = false;

  setStatus('Subiendo video (' + totalMB + ' MB) a Drive...', 'subiendo');
  mostrarProgreso(0);

  try {
    // Metadata del archivo
    var metadata = {
      name:    nombre,
      mimeType: 'video/webm',
      parents: [FOLDER_ID]
    };

    // Subir usando Drive API multipart upload
    var form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    setProgreso(20);

    var res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + accessToken },
        body:    form
      }
    );

    setProgreso(80);

    if (!res.ok) {
      var errText = await res.text();
      throw new Error('Drive API error: ' + errText);
    }

    var data   = await res.json();
    var fileId = data.id;

    // Hacer el archivo accesible con el link
    await fetch(
      'https://www.googleapis.com/drive/v3/files/' + fileId + '/permissions',
      {
        method:  'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      }
    );

    setProgreso(100);
    ocultarProgreso();
    setStatus('Video guardado. Cerrando ventana...', 'listo');
    document.getElementById('success-box').style.display = 'block';

    // Enviar fileId de vuelta al portal
    if (window.opener && !window.opener.closed) {
      window.opener.recibirDriveFileId(fileId);
    }

    setTimeout(function() { window.close(); }, 2000);

  } catch(err) {
    ocultarProgreso();
    mostrarError('Error al subir: ' + err.message);
    document.getElementById('btn-iniciar').disabled = false;
  }
}

function setStatus(msg, cls) {
  var el = document.getElementById('status');
  el.textContent = msg;
  el.className   = cls || '';
}
function mostrarProgreso(v) {
  document.getElementById('progress-wrap').style.display = 'block';
  setProgreso(v);
}
function setProgreso(v) {
  document.getElementById('progress-bar').style.width   = v + '%';
  document.getElementById('progress-label').textContent = 'Subiendo video... ' + v + '%';
}
function ocultarProgreso() {
  document.getElementById('progress-wrap').style.display = 'none';
}
function mostrarError(msg) {
  var el = document.getElementById('error-box');
  el.textContent = msg;
  el.style.display = 'block';
  setStatus('Error', '');
}

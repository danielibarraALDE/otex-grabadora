var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby5Gov9DiC5tQwH2urJfJtzH9OWlijT5pa_EhLyDPK2afV3jO2jOFZLvndAL80HTE7c/exec';

var mediaRecorder;
var chunks   = [];
var recTimer = null;
var recStart = null;
var CHUNK_MB = 3;

document.getElementById('btn-iniciar').addEventListener('click', iniciar);
document.getElementById('btn-detener').addEventListener('click', detener);

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

  setStatus('Subiendo video (' + totalMB + ' MB)...', 'subiendo');
  mostrarProgreso(0);

  try {
    var fileId = null;
    var CHUNK  = CHUNK_MB * 1024 * 1024;

    if (blob.size <= CHUNK) {
      var b64  = await toBase64(blob);
      setProgreso(30);
      var url1 = APPS_SCRIPT_URL + '?accion=subirVideo&nombre=' + encodeURIComponent(nombre) + '&base64=' + encodeURIComponent(b64);
      var res  = await fetch(url1);
      setProgreso(80);
      var data = await res.json();
      if (!data.ok) throw new Error(data.mensaje);
      fileId = data.fileId;
    } else {
      var total = Math.ceil(blob.size / CHUNK);
      for (var i = 0; i < total; i++) {
        var b64c = await toBase64(blob.slice(i * CHUNK, (i + 1) * CHUNK));
        var url2 = APPS_SCRIPT_URL
          + '?accion=chunk'
          + '&nombre='      + encodeURIComponent(nombre)
          + '&fileId='      + encodeURIComponent(fileId || '')
          + '&chunkIndex='  + i
          + '&totalChunks=' + total
          + '&base64='      + encodeURIComponent(b64c);
        var res2  = await fetch(url2);
        var data2 = await res2.json();
        if (!data2.ok) throw new Error(data2.mensaje);
        fileId = data2.fileId;
        setProgreso(Math.round(((i + 1) / total) * 100));
      }
    }

    setProgreso(100);
    ocultarProgreso();
    setStatus('Video guardado. Cerrando ventana...', 'listo');
    document.getElementById('success-box').style.display = 'block';

    if (window.opener && !window.opener.closed) {
      window.opener.recibirDriveFileId(fileId);
    }
    setTimeout(function() { window.close(); }, 2000);

  } catch(err) {
    ocultarProgreso();
    mostrarError('Error al subir el video: ' + err.message);
    document.getElementById('btn-iniciar').disabled = false;
  }
}

function toBase64(blob) {
  return new Promise(function(resolve, reject) {
    var r = new FileReader();
    r.onload  = function() { resolve(r.result.split(',')[1]); };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
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

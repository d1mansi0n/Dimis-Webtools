// ZE-script.js – Version mit einheitlicher, regex-basierter Verarbeitung aller Sprachbefehle

let entries = [];
let comments = JSON.parse(localStorage.getItem('comments')) || [];
let recognition;
let lastCommandTime = 0;
const DEBOUNCE_TIME = 300;

// Befehls-Synonyme (Englisch und Deutsch)
const newEntryCommands = ["new entry", "neuer eintrag", "eintrag hinzufügen"];
const startCommands    = ["start", "begin", "los", "anfangen", "timer starten", "starte timer"];
const pauseCommands    = ["pause", "anhalten", "unterbrechen", "pausieren", "timer pausieren"];
const stopCommands     = ["stop", "stopp", "beenden", "ende", "timer stoppen"];
const commentCommands  = ["comment", "kommentar", "notiz"];

updateCommentSuggestions();

// Normalisiert einen Text: Kleinbuchstaben, Satzzeichen entfernen, überflüssige Leerzeichen eliminieren
// Dabei bleiben Umlaute, ß und andere Unicode-Buchstaben erhalten
function normalizeText(text) {
  return text.toLowerCase()
    .replace(/[^\p{L}\d\s]/gu, ' ')  // \p{L} erlaubt alle Buchstaben, \d alle Ziffern
    .replace(/\s+/g, ' ')
    .trim();
}

// Regex-basiertes Matching, das flexible Leerzeichen zwischen Wörtern erlaubt
function matchesCommand(text, commands) {
  for (let cmd of commands) {
    // Zerlege den Befehl in Wörter und füge sie mit \s+ zusammen
    const pattern = '\\b' + cmd.split(/\s+/).join('\\s+') + '\\b';
    const regex = new RegExp(pattern, 'i');
    if (regex.test(text)) {
      return true;
    }
  }
  return false;
}

function initializeVoiceRecognition() {
  if (!('webkitSpeechRecognition' in window)) {
    alert('Web Speech API is not supported. Use Chrome or Edge.');
    return;
  }
  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  const langSelect = document.getElementById('languageSelect');
  recognition.lang = langSelect ? langSelect.value : 'en-US';
  
  recognition.onstart = () => console.log('Voice recognition started.');
  recognition.onerror = e => console.error('Voice recognition error:', e.error);
  recognition.onend = () => {
    console.log('Voice recognition ended.');
  };
  
  recognition.onresult = e => {
    let transcript = '';
    // Nur finale Ergebnisse berücksichtigen
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        transcript += e.results[i][0].transcript;
      }
    }
    if (transcript) {
      console.log('Final Voice Command Detected:', transcript);
      showCommandFeedback(transcript.trim());
      handleVoiceCommand(transcript.trim());
    }
  };
}

// Push-to-Talk Funktionen
function startVoiceRecognitionPush() {
  if (!recognition) {
    initializeVoiceRecognition();
  }
  recognition.start();
  document.getElementById('voiceBtn').classList.add('active');
}

function stopVoiceRecognitionPush() {
  if (recognition) {
    recognition.stop();
  }
  document.getElementById('voiceBtn').classList.remove('active');
}

// Aktualisierung der Spracheinstellung
function updateLanguage() {
  const langSelect = document.getElementById('languageSelect');
  if (recognition) {
    recognition.stop();
    recognition.lang = langSelect.value;
    console.log('Voice recognition language set to:', recognition.lang);
  }
}

// Zeigt ein kurzes Feedback zum erkannten Befehl an
function showCommandFeedback(message) {
  const feedbackDiv = document.getElementById('commandFeedback');
  if (feedbackDiv) {
    feedbackDiv.style.display = 'block';
    feedbackDiv.textContent = 'Command: ' + message;
    setTimeout(() => {
      feedbackDiv.style.display = 'none';
    }, 2000);
  }
}

function handleVoiceCommand(command) {
  const now = Date.now();
  if (now - lastCommandTime < DEBOUNCE_TIME) return;
  lastCommandTime = now;

  // Den erkannten Text normalisieren
  const normalized = normalizeText(command);
  console.log('Normalized command:', normalized);
  
  // Hole die ID des aktiven Eintrags (falls vorhanden)
  const entryId = getNextActiveEntryId();

  // Alle Befehle werden nun über matchesCommand geprüft
  if (matchesCommand(normalized, newEntryCommands)) {
    addNewEntry();
    return;
  }
  if (matchesCommand(normalized, commentCommands) && entryId) {
    // Entferne die Kommentar-Schlüsselwörter aus dem Text
    let commentText = normalized;
    commentCommands.forEach(keyword => {
      const pattern = '\\b' + keyword.split(/\s+/).join('\\s+') + '\\b';
      commentText = commentText.replace(new RegExp(pattern, 'gi'), '');
    });
    commentText = commentText.trim();
    if (commentText) {
      addCommentToEntry(entryId, commentText);
    } else {
      showCommandFeedback("Kein Kommentartext erkannt.");
    }
    return;
  }
  if (matchesCommand(normalized, startCommands) && entryId) {
    startEntryTimer(entryId);
    return;
  }
  if (matchesCommand(normalized, pauseCommands) && entryId) {
    pauseEntryTimer(entryId);
    return;
  }
  if (matchesCommand(normalized, stopCommands) && entryId) {
    stopEntryTimer(entryId);
    return;
  }
}

function getNextActiveEntryId() {
  const active = entries.find(e => !e.isStopped);
  return active?.id || null;
}

function addCommentToEntry(id, comment) {
  const row = document.getElementById(`entry-${id}`);
  if (row) row.querySelector('.comment-input').value = comment;
}

function addNewEntry() {
  const id = Date.now();
  const entry = {
    id,
    elapsed: 0,
    timerInterval: null,
    isPaused: true,
    isStopped: false,
    comment: '',
    date: getCurrentDate(),
    startTimeFormatted: '00:00:00',
    endTimeFormatted: '00:00:00'
  };
  entries.push(entry);

  const row = document.createElement('tr');
  row.id = `entry-${id}`;
  row.innerHTML = `
    <td>
      <div class="timer-controls">
        <button class="start-btn" onclick="startEntryTimer(${id})">Start</button>
        <button class="pause-btn" onclick="pauseEntryTimer(${id})">Pause</button>
        <button class="stop-btn" onclick="stopEntryTimer(${id})">Stop</button>
      </div>
    </td>
    <td class="elapsed-time">
      <div>${entry.startTimeFormatted} - ${entry.endTimeFormatted}</div>
      <div>Elapsed: <span class="pure-elapsed">00:00:00</span></div>
    </td>
    <td class="entry-date">${entry.date}</td>
    <td>
      <input type="text" class="comment-input" placeholder="Add comment" list="commentSuggestions">
    </td>
    <td>
      <button class="delete-btn" onclick="deleteEntry(${id})">Delete</button>
    </td>`;
  document.getElementById('timeEntries').appendChild(row);
}

function deleteEntry(id) {
  entries = entries.filter(e => e.id !== id);
  document.getElementById(`entry-${id}`)?.remove();
  updateTotalElapsedHours();
}

function startEntryTimer(id) {
  const alreadyRunning = entries.find(e => !e.isPaused && !e.isStopped && e.id !== id);
  if (alreadyRunning) {
    showCommandFeedback("Ein anderer Timer läuft bereits.");
    return;
  }

  const entry = entries.find(e => e.id === id);
  const row = document.getElementById(`entry-${id}`);
  if (!entry || entry.isStopped) return;

  clearInterval(entry.timerInterval);
  if (entry.isPaused) {
    const now = new Date();
    entry.currentStart = now; // temporär merken
    if (entry.startTimeFormatted === '00:00:00') {
      entry.startTimeFormatted = getTimeString(now);
    }
    entry.startTime = now - entry.elapsed;
    entry.isPaused = false;
    row.querySelector('.start-btn').classList.add('active');
    row.querySelector('.pause-btn').classList.remove('active');
  }
  entry.timerInterval = setInterval(() => updateEntryTimer(id), 1000);
}

function pauseEntryTimer(id) {
  const entry = entries.find(e => e.id === id);
  const row = document.getElementById(`entry-${id}`);
  if (!entry || entry.isStopped || entry.isPaused) return;

  clearInterval(entry.timerInterval);
  entry.isPaused = true;
  entry.elapsed = Date.now() - entry.startTime;

  // Sessions-Fallback falls nicht vorhanden
  if (!entry.sessions) {
    entry.sessions = [];
  }

  // Neue Zeitspanne speichern
  const start = entry.currentStart;
  const end = new Date();
  if (start) {
    entry.sessions.push({
      from: getTimeString(start),
      to: getTimeString(end)
    });
    entry.endTimeFormatted = getTimeString(end);
    delete entry.currentStart;
  }

  // Update DOM
  row.querySelector('.start-btn')?.classList.remove('active');
  row.querySelector('.pause-btn')?.classList.add('active');
  updateSessionList(row, entry.sessions);
  updateTotalElapsedHours();
}

function updateSessionList(row, sessions, tempEnd = null, total = null) {
  const timeDiv = row.querySelector('.elapsed-time');
  let spans = sessions.map(s => `<div>${s.from} - ${s.to}</div>`).join('');
  
  // Wenn Timer läuft, zeige aktuelle Session live an
  const runningStart = sessions.length > 0 && tempEnd ?
    `<div>${sessions.at(-1)?.to ? '' : `${getTimeString(new Date(sessions.at(-1).from))} - ${tempEnd}`}</div>` :
    '';
  
  if (runningStart) spans += runningStart;
  
  if (!total) {
    total = timeDiv.querySelector('.pure-elapsed')?.textContent || '00:00:00';
  }
  
  timeDiv.innerHTML = `${spans}<div>Elapsed: <span class="pure-elapsed">${total}</span></div>`;
}

function getTimeString(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function stopEntryTimer(id) {
  const entry = entries.find(e => e.id === id);
  const row = document.getElementById(`entry-${id}`);
  if (!entry || entry.isStopped) return;

  clearInterval(entry.timerInterval);
  entry.elapsed = Date.now() - entry.startTime;
  entry.isPaused = true;
  entry.isStopped = true;
  entry.endTimeFormatted = getTimeString(new Date());

  if (!entry.sessions) entry.sessions = [];

  // Letzte laufende Session beenden
  if (entry.currentStart) {
    entry.sessions.push({
      from: getTimeString(entry.currentStart),
      to: entry.endTimeFormatted
    });
    delete entry.currentStart;
  }

  const comment = row.querySelector('.comment-input')?.value;
  if (comment && !comments.includes(comment)) {
    comments.push(comment);
    localStorage.setItem('comments', JSON.stringify(comments));
    updateCommentSuggestions();
  }

  row.querySelector('.start-btn')?.classList.remove('active');
  row.querySelector('.pause-btn')?.classList.remove('active');

  // Session-Ansicht aktualisieren mit finalem Stand
  updateSessionList(row, entry.sessions, null, formatTime(entry.elapsed));

  row.querySelector('.comment-input').disabled = true;
  updateTotalElapsedHours();
}

function updateEntryTimer(id) {
  const entry = entries.find(e => e.id === id);
  const row = document.getElementById(`entry-${id}`);
  if (!entry || entry.isStopped) return;

  // Sicherheits-Fallback:
  if (!entry.sessions) entry.sessions = [];

  entry.elapsed = Date.now() - entry.startTime;
  const nowFormatted = getTimeString(new Date());
  const total = formatTime(entry.elapsed);

  const sessions = [...entry.sessions];

  if (entry.currentStart) {
    sessions.push({
      from: getTimeString(entry.currentStart),
      to: nowFormatted
    });
  }

  updateSessionList(row, sessions, null, total);
}

function formatTime(ms) {
  const pad = n => n.toString().padStart(2, '0');
  const totalSec = Math.floor(ms / 1000);
  const h = pad(Math.floor(totalSec / 3600));
  const m = pad(Math.floor((totalSec % 3600) / 60));
  const s = pad(totalSec % 60);
  return `${h}:${m}:${s}`;
}

function getCurrentDate() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear().toString().slice(-2)}`;
}

function getCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

function updateTotalElapsedHours() {
  const total = entries.reduce((sum, e) => sum + e.elapsed, 0);
  document.getElementById('totalElapsedHours').textContent = formatTime(total);
}

function updateCommentSuggestions() {
  document.getElementById('commentSuggestions').innerHTML = comments.map(c => `<option value="${c}">`).join('');
}

function toggleComments() {
  const list = document.getElementById('commentsList');
  const btn = document.getElementById('clearCommentsBtn');
  const visible = list.style.display !== 'block';
  list.style.display = visible ? 'block' : 'none';
  btn.style.display = visible ? 'inline-block' : 'none';
  if (visible) showComments();
}

function showComments() {
  const list = document.getElementById('commentsList');
  list.innerHTML = comments.map(c => `
    <div class="stored-comment">
      <span>${c}</span>
      <button onclick="deleteComment('${c.replace(/'/g, "\\'")}')">X</button>
    </div>`).join('');
}

function deleteComment(c) {
  comments = comments.filter(e => e !== c);
  localStorage.setItem('comments', JSON.stringify(comments));
  updateCommentSuggestions();
  showComments();
  if (!comments.length) {
    document.getElementById('commentsList').style.display = 'none';
    document.getElementById('clearCommentsBtn').style.display = 'none';
  }
}

function clearAllComments() {
  comments = [];
  localStorage.removeItem('comments');
  updateCommentSuggestions();
  showComments();
  document.getElementById('commentsList').style.display = 'none';
  document.getElementById('clearCommentsBtn').style.display = 'none';
}

function exportToExcel() {
  const data = [["Date", "Start Time", "End Time", "Elapsed Time", "Comment"]];
  let total = 0;
  entries.forEach(entry => {
    const row = document.getElementById(`entry-${entry.id}`);
    const comment = row?.querySelector('.comment-input')?.value || '';
    data.push([
      entry.date,
      entry.startTimeFormatted,
      entry.endTimeFormatted,
      formatTime(entry.elapsed),
      comment
    ]);
    total += entry.elapsed;
  });
  data.push(["Total", "", "", formatTime(total), ""]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Time Entries");
  XLSX.writeFile(wb, 'time_entries.xlsx');
}
// === CONFIG ===
const OPENROUTER_API_KEY = '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';
const SITE_URL = 'https://your-site.com';
const SITE_TITLE = 'Fitness Planner App';

let currentPlanContext = null;
let chatHistory = [];

// === ENTRY POINT ===
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('generate-btn').addEventListener('click', generatePlan);
  document.getElementById('chat-send').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') sendChatMessage();
  });
  loadHistory();
});

// === GENERATE PLAN ===
async function generatePlan() {
  const selected = Array.from(document.querySelectorAll('.muscle-group input:checked'))
    .map(cb => cb.value);
  const injuries = document.getElementById('injuries').value.trim();
  const dietPref  = document.getElementById('diet-pref').value;

  if (!selected.length) {
    return alert('Please select at least one muscle group.');
  }

  // Show plan & clear
  document.getElementById('plan').classList.remove('d-none');
  const planContent = document.getElementById('plan-content');
  planContent.innerHTML = '<p>Loading…</p>';
  document.getElementById('charts').classList.add('d-none');

  // Build AI prompt
  let prompt = `Generate a structured 7-day workout plan targeting: ${selected.join(', ')}. `;
  prompt += `Diet preference: ${dietPref}. `;
  if (injuries) {
    prompt += `The user has past injuries: ${injuries}. `;
  }
  prompt += `Include a diet plan with macros in grams (protein, carbs, fats) and weekly progress metrics. `
         + `Output markdown + JSON block like:\n\`\`\`json\n`
         + `{"macros":{"protein":<num>,"carbs":<num>,"fats":<num>},"progress":{"week":["W1","W2",...],"muscleGainKg":[...],"caloriesBurned":[...]}}\n\`\`\``;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer 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`,
        'HTTP-Referer': SITE_URL,
        'X-Title': SITE_TITLE,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'deepseek/deepseek-r1:free', messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    const content = data.choices[0].message.content;

    // Split markdown vs JSON
    const [md, jsonPart] = content.split('```json');
    let macros = null, progress = null;
    if (jsonPart) {
      const obj = JSON.parse(jsonPart.split('```')[0].trim());
      macros = obj.macros;
      progress = obj.progress;
    }

    // Render
    planContent.innerHTML = marked.parse(md)
                          + renderDietIcons(macros);
    document.getElementById('charts').classList.remove('d-none');
    renderCharts(macros, progress);

    // Save history
    const history = JSON.parse(localStorage.getItem('fitnessHistory')||'[]');
    history.unshift({
      date: new Date().toLocaleString(),
      selected, injuries, dietPref, md, macros, progress
    });
    localStorage.setItem('fitnessHistory', JSON.stringify(history));
    loadHistory();

    // Chat init
    currentPlanContext = true;
    chatHistory = [{ role:'system', content:`Plan: ${md}` }];
    document.getElementById('chat-section').classList.remove('d-none');
    document.getElementById('chat-messages').innerHTML = '';
  } catch {
    planContent.innerHTML = '<p>Error generating plan.</p>';
  }
}

// === RENDER ICONS ===
function renderDietIcons(macros) {
  if (!macros) return '';
  return `
    <div class="diet-icons">
      <h5><i class="fa-solid fa-utensils"></i> Macronutrients</h5>
      <p><i class="fa-solid fa-drumstick-bite"></i> <strong>Protein:</strong> ${macros.protein}g</p>
      <p><i class="fa-solid fa-bread-slice"></i> <strong>Carbs:</strong> ${macros.carbs}g</p>
      <p><i class="fa-solid fa-seedling"></i> <strong>Fats:</strong> ${macros.fats}g</p>
    </div>`;
}

// === CHARTS ===
function renderCharts(macros, progress) {
  new Chart(document.getElementById('dietChart').getContext('2d'), {
    type: 'pie',
    data: { labels:['Protein','Carbs','Fats'], datasets:[{ data:[macros.protein,macros.carbs,macros.fats] }] }
  });
  new Chart(document.getElementById('progressChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: progress.week,
      datasets: [
        { label:'Muscle Gain (kg)', data:progress.muscleGainKg },
        { label:'Calories Burned',  data:progress.caloriesBurned }
      ]
    }
  });
}

// === CHAT ===
async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg || !currentPlanContext) return;
  appendChat('user', msg);
  chatHistory.push({ role:'user', content:msg });
  input.value = '';
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:'POST',
      headers:{
        'Authorization':`Bearer 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`,
        'HTTP-Referer':SITE_URL,
        'X-Title':SITE_TITLE,
        'Content-Type':'application/json'
      },
      body: JSON.stringify({ model:'deepseek/deepseek-r1:free', messages:chatHistory })
    });
    const data = await res.json();
    const reply = data.choices[0].message.content;
    appendChat('bot', reply);
    chatHistory.push({ role:'assistant', content:reply });
  } catch {
    appendChat('bot','Error: could not get response.');
  }
}

function appendChat(who, text) {
  const c = document.getElementById('chat-messages');
  const d = document.createElement('div');
  d.className = `chat-message ${who}`;
  d.innerHTML = `<div class="message">${text}</div>`;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

// === HISTORY ===
function loadHistory() {
  const history = JSON.parse(localStorage.getItem('fitnessHistory')||'[]');
  const cont = document.getElementById('history');
  cont.innerHTML = '';
  history.forEach(entry => {
    const str = JSON.stringify(entry).replace(/'/g,"\\'");
    const card = document.createElement('div');
    card.className = 'col-md-4 mb-3';
    card.innerHTML = `
      <div class="card card-custom p-3 bg-white" onclick='selectPlan(${str})'>
        <strong>${entry.date}</strong><br/>
        <small>
          ${entry.selected.join(', ')}<br/>
          Injuries: ${entry.injuries || 'None'}<br/>
          Diet: ${entry.dietPref}
        </small>
      </div>`;
    cont.appendChild(card);
  });
}

function selectPlan(e) {
  currentPlanContext = true;
  document.getElementById('plan').classList.remove('d-none');
  document.getElementById('plan-content').innerHTML =
    marked.parse(e.md) + renderDietIcons(e.macros);
  document.getElementById('charts').classList.remove('d-none');
  renderCharts(e.macros, e.progress);
  chatHistory = [{ role:'system', content:`Plan: ${e.md}` }];
  document.getElementById('chat-section').classList.remove('d-none');
  document.getElementById('chat-messages').innerHTML = '';
}

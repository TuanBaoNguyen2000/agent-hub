'use strict';

const output = document.getElementById('output');
const reportLabel = document.getElementById('report');

async function start() {
  for (const scenario of await window.spike.list()) {
    const button = document.createElement('button');
    button.textContent = `${scenario.id} — ${scenario.label}`;
    button.addEventListener('click', async () => {
      button.disabled = true;
      output.textContent = `Running ${scenario.id}...`;
      output.textContent = JSON.stringify(await window.spike.run(scenario.id), null, 2);
      reportLabel.textContent = await window.spike.reportPath();
      button.disabled = false;
    });
    document.getElementById(scenario.visible ? 'visible' : 'quiet').append(button);
  }
}

start();

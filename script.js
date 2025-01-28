const riceInput = document.getElementById('riceInput');
const resultDiv = document.getElementById('result');
const settingsToggle = document.getElementById('settingsToggle');
const settingsTab = document.getElementById('settingsTab');
const ratioInput = document.getElementById('ratioInput');
const saveRatioButton = document.getElementById('saveRatio');

// Load saved ratio from local storage or use default (1.5)
let ratio = parseFloat(localStorage.getItem('waterToRiceRatio')) || 1.2;
ratioInput.value = ratio;

// Toggle settings tab visibility
settingsToggle.addEventListener('click', () => {
  settingsTab.classList.toggle('hidden');
});

// Save the ratio to local storage
saveRatioButton.addEventListener('click', () => {
  const newRatio = parseFloat(ratioInput.value);
  if (!isNaN(newRatio) && newRatio > 0) {
    ratio = newRatio;
    localStorage.setItem('waterToRiceRatio', ratio);
    alert('Ratio saved successfully!');
  } else {
    alert('Please enter a valid ratio (must be a positive number).');
  }
});

// Update result in real time
riceInput.addEventListener('input', () => {
  const cupsOfRice = parseFloat(riceInput.value);
  if (!isNaN(cupsOfRice)) {
    const cupsOfWater = cupsOfRice * ratio;
    resultDiv.textContent = cupsOfWater.toFixed(2);
  } else {
    resultDiv.textContent = '0.00';
  }
});

// Function to set the viewport height
function setViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Initial set
setViewportHeight();

// Update on window resize or orientation change
window.addEventListener('resize', setViewportHeight);
window.addEventListener('orientationchange', setViewportHeight);

// Prevent default behavior on input focus (optional, to avoid viewport resizing)
document.querySelector('input').addEventListener('focus', () => {
  window.scrollTo(0, 0);
});// Function to set the viewport height
function setViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Initial set
setViewportHeight();

// Update on window resize or orientation change
window.addEventListener('resize', setViewportHeight);
window.addEventListener('orientationchange', setViewportHeight);

// Prevent default behavior on input focus (optional, to avoid viewport resizing)
document.querySelector('input').addEventListener('focus', () => {
  window.scrollTo(0, 0);
});
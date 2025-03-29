const riceInput = document.getElementById('riceInput');
const resultDiv = document.getElementById('result');
const settingsToggle = document.getElementById('settingsToggle');
const settingsTab = document.getElementById('settingsTab');
const ratioInput = document.getElementById('ratioInput');
const saveRatioButton = document.getElementById('saveRatio');
const container = document.querySelector('.container');

// Load saved ratio from local storage or use default (1.2)
let ratio = parseFloat(localStorage.getItem('waterToRiceRatio')) || 1.2;
ratioInput.value = ratio;

// Toggle settings tab visibility (slide effect)
settingsToggle.addEventListener('click', () => {
  settingsTab.classList.toggle('show');
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

// Adjust container on keyboard open/close
function adjustContainerForKeyboard() {
  if (window.visualViewport) {
    const visualViewportHeight = window.visualViewport.height;
    const layoutViewportHeight = window.innerHeight;

    // nur verschieben, wenn Viewport deutlich kleiner ist (also Tastatur sichtbar)
    if (visualViewportHeight < layoutViewportHeight - 150) {
      container.style.transform = 'translateY(-50px)';
    } else {
      container.style.transform = 'translateY(0)';
    }
  }
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', adjustContainerForKeyboard);
}

['focus', 'blur'].forEach((eventName) => {
  document.addEventListener(eventName, () => {
    setTimeout(adjustContainerForKeyboard, 50);
  });
});
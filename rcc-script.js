const riceInput = document.getElementById('riceInput');
const resultDiv = document.getElementById('result');
const settingsToggle = document.getElementById('settingsToggle');
const settingsTab = document.getElementById('settingsTab');
const ratioInput = document.getElementById('ratioInput');
const saveRatioButton = document.getElementById('saveRatio');

// Load saved ratio from local storage or use default (1.2)
let ratio = parseFloat(localStorage.getItem('waterToRiceRatio')) || 1.2;
ratioInput.value = ratio;

// Toggle settings tab visibility (with slide effect)
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

// Function to adjust the container when the keyboard appears
function adjustContainerForKeyboard() {
  const container = document.querySelector('.container');
  if (window.visualViewport) {
    const visualViewportHeight = window.visualViewport.height;
    const layoutViewportHeight = window.innerHeight;
    
    if (visualViewportHeight < layoutViewportHeight) {
      const offset = layoutViewportHeight - visualViewportHeight * 1.5;
      container.style.transform = `translateY(-${offset}px)`;
    } else {
      container.style.transform = 'translateY(0)';
    }
  }
}

// Listen for visual viewport changes (keyboard open/close)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', adjustContainerForKeyboard);
}

riceInput.addEventListener('focus', () => {
  adjustContainerForKeyboard();
});

riceInput.addEventListener('blur', () => {
  const container = document.querySelector('.container');
  container.style.transform = 'translateY(0)';
});
const riceInput = document.getElementById('riceInput');
const resultDiv = document.getElementById('result');
const settingsToggle = document.getElementById('settingsToggle');
const settingsTab = document.getElementById('settingsTab');
const ratioInput = document.getElementById('ratioInput');
const saveRatioButton = document.getElementById('saveRatio');

// Load saved ratio from local storage or use default (1.2)
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

// Function to adjust the container when the keyboard appears
function adjustContainerForKeyboard() {
  const container = document.querySelector('.container');
  if (window.visualViewport) {
    // Get the height of the visual viewport (visible area)
    const visualViewportHeight = window.visualViewport.height;
    // Get the height of the layout viewport (full page)
    const layoutViewportHeight = window.innerHeight;

    // If the visual viewport is smaller than the layout viewport, the keyboard is open
    if (visualViewportHeight < layoutViewportHeight) {
      // Calculate how much the viewport has shrunk
      const offset = layoutViewportHeight - visualViewportHeight * 1.5;
      // Move the container up by the offset
      container.style.transform = `translateY(-${offset}px)`;
    } else {
      // Reset the container position if the keyboard is closed
      container.style.transform = 'translateY(0)';
    }
  }
}

// Listen for visual viewport changes (keyboard open/close)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', adjustContainerForKeyboard);
}

// Prevent default behavior on input focus (optional, to avoid viewport resizing)
riceInput.addEventListener('focus', () => {
  adjustContainerForKeyboard();
});

// Reset the container position when the input loses focus
riceInput.addEventListener('blur', () => {
  const container = document.querySelector('.container');
  container.style.transform = 'translateY(0)';
});

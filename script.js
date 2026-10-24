
const themeToggleBtn = document.querySelector('#themeToggleBtn');

// 💾 Load saved mode setting from browser memory (defaults to dark mode baseline)
const savedTheme = localStorage.getItem('websiteTheme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

// Match the button text label to whatever theme is currently loaded
updateButtonLook(savedTheme);

themeToggleBtn.addEventListener('click', function() {
    // Check what color palette is active on the screen right now
    let currentTheme = document.documentElement.getAttribute('data-theme');
    let targetTheme = 'dark';

    // FIXED LOGIC LOOP: If it's dark, switch to light. If it's light, switch to dark!
    if (currentTheme === 'dark') {
        targetTheme = 'light';
    } else {
        targetTheme = 'dark';
    }

    // Apply the selection to the HTML document tag instantly
    document.documentElement.setAttribute('data-theme', targetTheme);
    
    // Save the choice so it doesn't reset when they reload the page
    localStorage.setItem('websiteTheme', targetTheme);
    
    // Flip the button label so it tells you what will happen on the NEXT click
    updateButtonLook(targetTheme);
});

// ☀️ Function to ensure the button text matches what layout is coming up next
function updateButtonLook(activeTheme) {
    if (activeTheme === 'light') {
        themeToggleBtn.innerText = "🌙 Switch to Dark Mode";
    } else {
        themeToggleBtn.innerText = "☀️ Switch to Light Mode";
    }
}


// content.js
// Detects when user is in a meeting and notifies background script

function detectMeetingPage() {
  const url = window.location.href;
  
  // Google Meet detection
  if (url.includes('meet.google.com/') && url.match(/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/)) {
    return 'google-meet';
  }
  
  // Zoom detection
  if (url.includes('zoom.us/') && (url.includes('/j/') || url.includes('/wc/join/'))) {
    return 'zoom';
  }
  
  // Microsoft Teams detection
  if (url.includes('teams.microsoft.com/') && (url.includes('/l/meetup-join/') || url.includes('/_#/l/meetup-join/'))) {
    return 'teams';
  }
  
  return null;
}

function isMeetingActive() {
  const meetingType = detectMeetingPage();
  
  if (meetingType === 'google-meet') {
    // Check if video grid or participant elements exist
    return document.querySelector('[data-meeting-title]') || 
           document.querySelector('[data-participant-id]') ||
           document.querySelector('[jsname="HNNBSb"]'); // Google Meet video container
  }
  
  if (meetingType === 'zoom') {
    // Check for Zoom meeting container
    return document.querySelector('#wc-container') || 
           document.querySelector('.meeting-client') ||
           document.querySelector('[id*="video"]');
  }
  
  if (meetingType === 'teams') {
    // Check for Teams meeting elements
    return document.querySelector('[data-tid="meeting-canvas"]') ||
           document.querySelector('.ts-calling-screen') ||
           document.querySelector('[class*="calling-stage"]');
  }
  
  return false;
}

// Wait for meeting to fully load, then notify background
function checkAndNotify() {
  const meetingType = detectMeetingPage();
  
  if (meetingType && isMeetingActive()) {
    console.log(`Meeting detected: ${meetingType}`);
    
    // Send message to background script to open recorder
    chrome.runtime.sendMessage({
      action: 'meetingDetected',
      meetingType: meetingType,
      url: window.location.href
    });
    
    return true;
  }
  return false;
}

// Initial check after page load
setTimeout(() => {
  checkAndNotify();
}, 2000);

// Monitor for dynamic loading (SPAs)
let checkInterval = setInterval(() => {
  if (checkAndNotify()) {
    // Stop checking once meeting is detected
    clearInterval(checkInterval);
  }
}, 3000);

// Stop checking after 30 seconds
setTimeout(() => {
  clearInterval(checkInterval);
}, 30000);

// Listen for URL changes (for SPAs like Teams/Meet)
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    console.log('URL changed, rechecking for meeting...');
    
    // Restart checking
    clearInterval(checkInterval);
    checkInterval = setInterval(() => {
      if (checkAndNotify()) {
        clearInterval(checkInterval);
      }
    }, 3000);
    
    setTimeout(() => clearInterval(checkInterval), 30000);
  }
}).observe(document, { subtree: true, childList: true });

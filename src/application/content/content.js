// content.js
// Detects when user is in a meeting and notifies background script

let hasNotified = false; // Prevent multiple notifications

function detectMeetingPage() {
  const url = window.location.href;
  const hash = window.location.hash;

  // Google Meet detection
  if (url.includes('meet.google.com/') && url.match(/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/)) {
    return 'google-meet';
  }

  // Zoom detection
  if (url.includes('zoom.us/') && (url.includes('/j/') || url.includes('/wc/join/'))) {
    return 'zoom';
  }

  // Microsoft Teams detection - STRICT (only when actually in meeting)
  if (url.includes('teams.microsoft.com') || url.includes('.teams.microsoft.com') ||
    url.includes('teams.live.com') || url.includes('.teams.live.com')) {

    // Check URL patterns for actual meeting
    if (url.includes('/l/meetup-join/') ||
      url.includes('/_#/l/meetup-join/') ||
      url.includes('/_#/pre-join-calling/') ||
      url.includes('/calling/') ||
      url.includes('action=visit') ||
      hash.includes('meetup-join') ||
      hash.includes('calling') ||
      hash.includes('pre-join')) {
      return 'teams';
    }

    // For teams.live.com, URL doesn't change - detect by UI elements
    // Check if we're actually IN a meeting (has Leave button + Mute)
    if (isTeamsMeetingUIPresent()) {
      console.log('Teams meeting detected via UI elements');
      return 'teams';
    }
  }

  return null;
}

function isTeamsMeetingUIPresent() {
  // STRICT: Must have Leave/Hang up button (only present during active call)
  const hasLeaveButton = document.querySelector('button[aria-label*="Leave"]') ||
    document.querySelector('button[aria-label*="Hang up"]') ||
    document.querySelector('button[title*="Leave"]') ||
    document.querySelector('button[title*="Hang up"]');

  if (!hasLeaveButton) {
    console.log('No Leave button found - not in meeting');
    return false;
  }

  // Also check for Mute button (double confirmation)
  const hasMuteControl = document.querySelector('button[aria-label*="Mute"]') ||
    document.querySelector('button[aria-label*="microphone"]') ||
    document.querySelector('button[title*="Mute"]');

  if (hasLeaveButton && hasMuteControl) {
    console.log('Leave + Mute buttons found - IN MEETING');
    return true;
  }

  console.log('Missing required controls for meeting detection');
  return false;
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
    // For Teams, the UI check is already done in detectMeetingPage
    return isTeamsMeetingUIPresent();
  }

  return false;
}

// Wait for meeting to fully load, then notify background
function checkAndNotify() {
  // Don't notify again if already notified
  if (hasNotified) {
    return true;
  }

  const meetingType = detectMeetingPage();

  if (meetingType && isMeetingActive()) {
    console.log(`Meeting detected: ${meetingType}`);

    // Send message to background script to open recorder
    chrome.runtime.sendMessage({
      action: 'meetingDetected',
      meetingType: meetingType,
      url: window.location.href
    });

    hasNotified = true; // Mark as notified
    return true;
  }
  return false;
}

// Initial check after page load
setTimeout(() => {
  console.log('Running initial meeting detection check...');
  checkAndNotify();
}, 3000); // Increased delay for Teams

// Monitor for dynamic loading (SPAs) - CONTINUOUS checking
let checkInterval = setInterval(() => {
  if (checkAndNotify()) {
    // For Teams, keep checking even after detection
    // because UI might appear gradually
    console.log('Meeting detected, but continuing to monitor...');
  }
}, 2000); // Check every 2 seconds

// Stop checking after 60 seconds (increased for Teams)
setTimeout(() => {
  clearInterval(checkInterval);
  console.log('Stopped continuous meeting detection');
}, 60000);

// Listen for URL changes (for SPAs like Teams/Meet)
let lastUrl = location.href;
let lastHash = location.hash;
new MutationObserver(() => {
  const currentUrl = location.href;
  const currentHash = location.hash;

  if (currentUrl !== lastUrl || currentHash !== lastHash) {
    lastUrl = currentUrl;
    lastHash = currentHash;
    console.log('URL or hash changed, rechecking for meeting...', currentUrl, currentHash);

    // Reset notification flag to allow re-detection
    hasNotified = false;

    // Immediate check
    setTimeout(() => checkAndNotify(), 1000);
  }
}).observe(document, { subtree: true, childList: true });

// Also listen for hash changes explicitly
window.addEventListener('hashchange', () => {
  console.log('Hash changed event fired:', location.hash);
  hasNotified = false;
  setTimeout(() => checkAndNotify(), 1000);
});

console.log('Teams meeting detection content script loaded - aggressive mode');
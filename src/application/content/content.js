// content.js
// Detects when user is in a meeting and notifies background script

// Prevent multiple script injections
if (window.meetingDetectionLoaded) {
  console.log('Meeting detection already loaded, skipping...');
  throw new Error('Script already loaded');
}
window.meetingDetectionLoaded = true;

// Track meeting sessions to prevent duplicate notifications
let meetingSessionId = null; // Unique ID for current meeting session
let currentMeetingType = null;

function generateSessionId() {
  return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function detectMeetingPage() {
  const url = window.location.href;
  const hash = window.location.hash;

  // Google Meet detection
  if (url.includes('meet.google.com/') && url.match(/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/)) {
    return 'google-meet';
  }

  // Zoom detection - ONLY actual meeting pages
  if (url.includes('zoom.us/')) {
    if (url.match(/zoom\.us\/wc\/join\/\d+/) ||
      url.match(/zoom\.us\/wc\/\d+/) ||
      url.match(/zoom\.us\/j\/\d+/) ||
      hash.includes('/join') ||
      hash.includes('/wc/join/')) {
      return 'zoom';
    }
    return null; // Dashboard or other non-meeting pages
  }

  // Microsoft Teams detection
  if (url.includes('teams.microsoft.com') || url.includes('.teams.microsoft.com') ||
    url.includes('teams.live.com') || url.includes('.teams.live.com')) {

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

    if (isTeamsMeetingUIPresent()) {
      console.log('Teams meeting detected via UI elements');
      return 'teams';
    }
  }

  return null;
}

function isTeamsMeetingUIPresent() {
  const hasLeaveButton = document.querySelector('button[aria-label*="Leave"]') ||
    document.querySelector('button[aria-label*="Hang up"]') ||
    document.querySelector('button[title*="Leave"]') ||
    document.querySelector('button[title*="Hang up"]');

  if (!hasLeaveButton) {
    return false;
  }

  const hasMuteControl = document.querySelector('button[aria-label*="Mute"]') ||
    document.querySelector('button[aria-label*="microphone"]') ||
    document.querySelector('button[title*="Mute"]');

  return hasLeaveButton && hasMuteControl;
}

function isMeetingActive() {
  const meetingType = detectMeetingPage();

  if (meetingType === 'google-meet') {
    return document.querySelector('[data-meeting-title]') ||
      document.querySelector('[data-participant-id]') ||
      document.querySelector('[jsname="HNNBSb"]');
  }

  if (meetingType === 'zoom') {
    // Check for webclient iframe or meeting controls
    const hasWebClientIframe = document.querySelector('#webclient') ||
      document.querySelector('iframe[id*="webclient"]') ||
      document.querySelector('iframe[src*="zoom.us"]');

    const hasMeetingControls = document.querySelector('button[aria-label*="Mute"]') ||
      document.querySelector('button[aria-label*="Leave"]');

    return hasWebClientIframe || hasMeetingControls;
  }

  if (meetingType === 'teams') {
    return isTeamsMeetingUIPresent();
  }

  return false;
}

// Extract meeting identifier from URL to track unique sessions
function getMeetingIdentifier() {
  const url = window.location.href;
  const hash = window.location.hash;

  // For Zoom: extract meeting ID
  const zoomMatch = url.match(/\/(?:wc\/join\/|wc\/|j\/)(\d+)/);
  if (zoomMatch) return 'zoom_' + zoomMatch[1];

  // For Meet: extract meeting code
  const meetMatch = url.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
  if (meetMatch) return 'meet_' + meetMatch[1];

  // For Teams: use hash or URL pattern
  if (hash.includes('meetup-join') || url.includes('/l/meetup-join/')) {
    return 'teams_' + (hash || url).replace(/[^a-z0-9]/gi, '_').substr(0, 50);
  }

  return null;
}

function checkAndNotify() {
  const meetingType = detectMeetingPage();
  const meetingIdentifier = getMeetingIdentifier();

  // No meeting detected
  if (!meetingType || !isMeetingActive()) {
    // Clear session if we left the meeting
    if (meetingSessionId && currentMeetingType) {
      console.log('Left meeting, clearing session:', meetingSessionId);
      meetingSessionId = null;
      currentMeetingType = null;
    }
    return false;
  }

  // Check if this is a NEW meeting session
  const isNewMeeting = meetingSessionId === null ||
    meetingIdentifier !== currentMeetingType;

  if (isNewMeeting) {
    // Generate new session ID for this meeting
    meetingSessionId = generateSessionId();
    currentMeetingType = meetingIdentifier;

    console.log(`NEW meeting detected: ${meetingType} (Session: ${meetingSessionId})`);

    // Send message to background script
    chrome.runtime.sendMessage({
      action: 'meetingDetected',
      meetingType: meetingType,
      sessionId: meetingSessionId,
      url: window.location.href
    });

    return true;
  } else {
    console.log('Same meeting session, skipping notification');
    return false;
  }
}

// Initial check after page load
setTimeout(() => {
  console.log('Running initial meeting detection check...');
  checkAndNotify();
}, 3000);

// Continuous monitoring for dynamic loading
let checkInterval = setInterval(() => {
  checkAndNotify();
}, 2000);

// Stop checking after 60 seconds
setTimeout(() => {
  clearInterval(checkInterval);
  console.log('Stopped continuous meeting detection');
}, 60000);

// Listen for URL changes (for SPAs)
let lastUrl = location.href;
let lastHash = location.hash;
new MutationObserver(() => {
  const currentUrl = location.href;
  const currentHash = location.hash;

  if (currentUrl !== lastUrl || currentHash !== lastHash) {
    lastUrl = currentUrl;
    lastHash = currentHash;
    console.log('URL/hash changed, rechecking:', currentUrl);

    // Always check on URL change (will auto-detect if it's new or same meeting)
    setTimeout(() => checkAndNotify(), 1000);
  }
}).observe(document, { subtree: true, childList: true });

// Hash change listener
window.addEventListener('hashchange', () => {
  console.log('Hash changed event:', location.hash);
  setTimeout(() => checkAndNotify(), 1000);
});

console.log('Meeting detection content script loaded');

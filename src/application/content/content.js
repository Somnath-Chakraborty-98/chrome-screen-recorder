// content.js
// Detects when user is in a meeting and notifies background script

// Prevent multiple script injections
if (window.meetingDetectionLoaded) {
  console.log('Meeting detection already loaded, skipping...');
  throw new Error('Script already loaded');
}
window.meetingDetectionLoaded = true;

// Track meeting sessions to prevent duplicate notifications
let meetingSessionId = null;
let currentMeetingIdentifier = null;
let wasInMeeting = false; // Track previous meeting state
let detectionCheckCount = 0; // Debug counter

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
    return null;
  }

  // Microsoft Teams detection - IMPROVED
  if (url.includes('teams.microsoft.com') || url.includes('.teams.microsoft.com') ||
    url.includes('teams.live.com') || url.includes('.teams.live.com')) {

    // Check URL patterns first
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

    // Check for meeting UI elements
    if (isTeamsMeetingUIPresent()) {
      return 'teams';
    }
  }

  return null;
}

function isTeamsMeetingUIPresent() {
  // Check for meeting controls - expanded selectors
  const leaveSelectors = [
    'button[aria-label*="Leave"]',
    'button[aria-label*="Hang up"]',
    'button[title*="Leave"]',
    'button[title*="Hang up"]',
    'button[data-tid*="call-hangup"]',
    'button[id*="hangup"]',
    '[role="button"][aria-label*="Leave"]'
  ];

  const muteSelectors = [
    'button[aria-label*="Mute"]',
    'button[aria-label*="microphone"]',
    'button[aria-label*="Unmute"]',
    'button[title*="Mute"]',
    'button[data-tid*="toggle-mute"]',
    '[role="button"][aria-label*="Mute"]'
  ];

  const videoSelectors = [
    'button[aria-label*="camera"]',
    'button[aria-label*="video"]',
    'button[title*="camera"]',
    'button[title*="video"]',
    'button[data-tid*="toggle-video"]'
  ];

  // Check for meeting stage/canvas
  const stageSelectors = [
    '[data-tid="meeting-stage"]',
    '[class*="meeting-stage"]',
    '[class*="calling-stage"]',
    '[id*="meeting-canvas"]',
    '[class*="ts-calling-screen"]'
  ];

  const hasLeaveButton = leaveSelectors.some(sel => document.querySelector(sel));
  const hasMuteControl = muteSelectors.some(sel => document.querySelector(sel));
  const hasVideoControl = videoSelectors.some(sel => document.querySelector(sel));
  const hasMeetingStage = stageSelectors.some(sel => document.querySelector(sel));

  // Meeting is active if we have leave button AND (mute OR video control) OR meeting stage
  const isInMeeting = hasLeaveButton && (hasMuteControl || hasVideoControl || hasMeetingStage);

  if (isInMeeting && detectionCheckCount % 10 === 0) {
    console.log('Teams meeting UI detected:', {
      leave: hasLeaveButton,
      mute: hasMuteControl,
      video: hasVideoControl,
      stage: hasMeetingStage
    });
  }

  return isInMeeting;
}

function isMeetingActive() {
  const meetingType = detectMeetingPage();

  if (meetingType === 'google-meet') {
    return document.querySelector('[data-meeting-title]') ||
      document.querySelector('[data-participant-id]') ||
      document.querySelector('[jsname="HNNBSb"]');
  }

  if (meetingType === 'zoom') {
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

  // For Teams: improved identifier extraction
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) {
    // Try to extract thread ID from URL
    const threadMatch = url.match(/threadId=([^&]+)/);
    if (threadMatch) return 'teams_thread_' + threadMatch[1].substr(0, 20);

    // Try hash-based ID
    const hashMatch = hash.match(/\/meetup-join\/([^\/\?]+)/);
    if (hashMatch) return 'teams_join_' + hashMatch[1].substr(0, 20);

    // Fallback: use normalized hash/URL
    const normalized = (hash || url).replace(/[^a-z0-9]/gi, '_').substr(0, 50);
    return 'teams_' + normalized;
  }

  return null;
}

function safeSendMessage(msg) {
  try {
    // chrome.runtime may be undefined or its context invalid
    if (chrome?.runtime?.id) {
      chrome.runtime.sendMessage(msg).catch(err => {
        if (String(err).includes('Extension context invalidated')) {
          console.log('Extension context invalidated, ignoring message');
        } else {
          console.error('Failed to send meeting detection message:', err);
        }
      });
    } else {
      // Runtime gone, ignore silently
      console.log('Extension runtime not available, skipping message');
    }
  } catch (err) {
    if (String(err).includes('Extension context invalidated')) {
      console.log('Extension context invalidated, ignoring message');
    } else {
      console.error('Unexpected sendMessage error:', err);
    }
  }
}


function checkAndNotify() {
  detectionCheckCount++;

  const meetingType = detectMeetingPage();
  const isActive = isMeetingActive();
  const meetingIdentifier = getMeetingIdentifier();

  // Log state every 10 checks for debugging
  if (detectionCheckCount % 10 === 0) {
    console.log('Meeting detection check #' + detectionCheckCount + ':', {
      type: meetingType,
      active: isActive,
      identifier: meetingIdentifier,
      wasInMeeting: wasInMeeting,
      currentSession: meetingSessionId
    });
  }

  // CASE 1: No meeting detected or not active
  if (!meetingType || !isActive) {
    // Only clear if we were previously in a meeting
    if (wasInMeeting) {
      console.log('LEFT meeting, clearing session:', meetingSessionId);
      meetingSessionId = null;
      currentMeetingIdentifier = null;
      wasInMeeting = false;
    }
    return false;
  }

  // CASE 2: Meeting is active
  wasInMeeting = true;

  // Check if this is a NEW meeting session (different identifier)
  const isNewMeeting = currentMeetingIdentifier !== meetingIdentifier;

  if (isNewMeeting) {
    // Generate new session ID for this meeting
    meetingSessionId = generateSessionId();
    currentMeetingIdentifier = meetingIdentifier;

    console.log('✅ NEW MEETING DETECTED:', {
      type: meetingType,
      sessionId: meetingSessionId,
      identifier: meetingIdentifier,
      url: window.location.href
    });

    // Send message to background script
    safeSendMessage({
      action: 'meetingDetected',
      meetingType,
      sessionId: meetingSessionId,
      identifier: meetingIdentifier,
      url: window.location.href
    });


    return true;
  }

  // Same meeting, no notification needed
  return false;
}

// Initial check after page load with longer delay for Teams
setTimeout(() => {
  console.log('🔍 Running initial meeting detection check...');
  checkAndNotify();
}, 4000); // Increased delay for Teams SPA

// Aggressive continuous monitoring for first 90 seconds
let checkInterval = setInterval(() => {
  checkAndNotify();
}, 1500); // Check every 1.5 seconds

// After 90 seconds, reduce to less frequent checks
setTimeout(() => {
  clearInterval(checkInterval);
  console.log('Switching to reduced-frequency monitoring...');

  // Continue checking but less frequently
  checkInterval = setInterval(() => {
    checkAndNotify();
  }, 5000); // Every 5 seconds
}, 90000);

// Listen for URL changes (critical for SPAs like Teams)
let lastUrl = location.href;
let lastHash = location.hash;

const urlChangeObserver = new MutationObserver(() => {
  const currentUrl = location.href;
  const currentHash = location.hash;

  if (currentUrl !== lastUrl || currentHash !== lastHash) {
    const oldUrl = lastUrl;
    const oldHash = lastHash;
    lastUrl = currentUrl;
    lastHash = currentHash;

    console.log('🔄 URL/hash changed:', {
      from: oldUrl + oldHash,
      to: currentUrl + currentHash
    });

    // Reset meeting state on URL change to force re-detection
    if (currentUrl !== oldUrl) {
      console.log('URL changed - resetting meeting state');
      wasInMeeting = false;
      currentMeetingIdentifier = null;
    }

    // Check immediately and again after delay
    setTimeout(() => checkAndNotify(), 500);
    setTimeout(() => checkAndNotify(), 2000);
    setTimeout(() => checkAndNotify(), 4000);
  }
});

urlChangeObserver.observe(document, {
  subtree: true,
  childList: true
});

// Hash change listener (backup)
window.addEventListener('hashchange', () => {
  console.log('🔄 Hash changed event:', location.hash);
  setTimeout(() => checkAndNotify(), 500);
  setTimeout(() => checkAndNotify(), 2000);
});

// Visibility change listener - recheck when tab becomes visible
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    console.log('🔄 Tab became visible, rechecking meeting state...');
    setTimeout(() => checkAndNotify(), 1000);
  }
});

// Focus listener - recheck when window gets focus
window.addEventListener('focus', () => {
  console.log('🔄 Window focused, rechecking meeting state...');
  setTimeout(() => checkAndNotify(), 1000);
});

console.log('✅ Meeting detection content script loaded and monitoring...');

// Clean up timers and observers when page unloads
window.addEventListener('unload', () => {
  try {
    clearInterval(checkInterval);
    urlChangeObserver.disconnect();
    console.log('Content script cleanup complete');
  } catch (e) {
    // Silently handle any errors during cleanup
  }
});
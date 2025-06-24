import { CalendarEvent } from '../App';

// Google Calendar API configuration
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

// Google API client instance
let gapi: any = null;
let tokenClient: any = null;
let isInitialized = false;
let accessToken: string | null = null;
let tokenExpiry: number | null = null;

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'familytasks_google_access_token',
  TOKEN_EXPIRY: 'familytasks_google_token_expiry'
};

// Token management functions
const saveTokenToStorage = (token: string, expiresIn: number) => {
  const expiryTime = Date.now() + (expiresIn * 1000);
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiryTime.toString());
  accessToken = token;
  tokenExpiry = expiryTime;
};

const loadTokenFromStorage = (): boolean => {
  const storedToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const storedExpiry = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);

  if (!storedToken || !storedExpiry) {
    return false;
  }

  const expiryTime = parseInt(storedExpiry);
  const now = Date.now();

  // Check if token is still valid (with 5 minute buffer)
  if (expiryTime - now < 5 * 60 * 1000) {
    clearTokenFromStorage();
    return false;
  }

  accessToken = storedToken;
  tokenExpiry = expiryTime;
  return true;
};

const clearTokenFromStorage = () => {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
  accessToken = null;
  tokenExpiry = null;
};

const isTokenValid = (): boolean => {
  if (!accessToken || !tokenExpiry) {
    return false;
  }

  // Check if token is still valid (with 5 minute buffer)
  return tokenExpiry - Date.now() > 5 * 60 * 1000;
};

// Auto-refresh token if needed
export const ensureValidToken = async (): Promise<boolean> => {
  if (isTokenValid()) {
    return true;
  }

  // Try to restore from storage
  if (loadTokenFromStorage()) {
    return true;
  }

  // Token is expired or missing, user needs to sign in again
  return false;
};

// Get token expiry info for debugging
export const getTokenInfo = () => {
  if (!accessToken || !tokenExpiry) {
    return null;
  }

  const now = Date.now();
  const timeUntilExpiry = tokenExpiry - now;

  return {
    hasToken: !!accessToken,
    expiresAt: new Date(tokenExpiry),
    timeUntilExpiry: Math.floor(timeUntilExpiry / 1000), // seconds
    isValid: timeUntilExpiry > 5 * 60 * 1000 // 5 minute buffer
  };
};

// Initialize Google API with GIS
export const initializeGoogleAPI = async (): Promise<boolean> => {
  try {
    if (isInitialized) {
      // Try to restore token from storage
      loadTokenFromStorage();
      return true;
    }

    // Try to restore token from storage first
    loadTokenFromStorage();

    // Load Google API script and GIS script
    await Promise.all([
      loadGoogleAPIScript(),
      loadGISScript()
    ]);

    gapi = window.gapi;

    // Load only client (no auth2)
    await new Promise<void>((resolve, reject) => {
      gapi.load('client', {
        callback: resolve,
        onerror: reject
      });
    });

    await initializeGapiClient();
    await initializeTokenClient();

    isInitialized = true;
    return true;
  } catch (error) {
    console.error('Failed to initialize Google API:', error);
    return false;
  }
};

// Load Google API script dynamically
const loadGoogleAPIScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.gapi) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google API script'));
    document.head.appendChild(script);
  });
};

// Load Google Identity Services script
const loadGISScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load GIS script'));
    document.head.appendChild(script);
  });
};

// Initialize GAPI client (without auth)
const initializeGapiClient = async () => {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;



  if (!apiKey) {
    throw new Error('Google API key not configured. Please set VITE_GOOGLE_API_KEY in your .env file');
  }

  try {
    await gapi.client.init({
      apiKey: apiKey,
      discoveryDocs: [DISCOVERY_DOC]
    });


  } catch (error) {
    console.error('GAPI client initialization failed:', error);
    throw error;
  }
};

// Initialize Token Client for OAuth
const initializeTokenClient = async () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId) {
    throw new Error('Google Client ID not configured. Please set VITE_GOOGLE_CLIENT_ID in your .env file');
  }



  try {
    tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.access_token) {
          // Save token to storage with expiry
          const expiresIn = response.expires_in || 3600; // Default to 1 hour
          saveTokenToStorage(response.access_token, expiresIn);
        } else {
          console.error('Failed to receive access token:', response);
        }
      },
    });


  } catch (error) {
    console.error('Token client initialization failed:', error);
    throw error;
  }
};

// Check if user is signed in
export const isSignedIn = (): boolean => {
  // First check if we have a valid token in memory
  if (isTokenValid()) {
    return true;
  }

  // Try to restore from storage
  if (loadTokenFromStorage()) {
    return true;
  }

  return false;
};

// Sign in to Google using GIS
export const signIn = async (): Promise<boolean> => {
  try {
    if (!tokenClient) {
      const success = await initializeGoogleAPI();
      if (!success) {
        return false;
      }
    }

    if (!tokenClient) {
      return false;
    }

    return new Promise((resolve) => {
      // Update callback to resolve promise
      tokenClient.callback = (response: any) => {
        if (response.access_token) {
          // Save token to storage with expiry
          const expiresIn = response.expires_in || 3600; // Default to 1 hour
          saveTokenToStorage(response.access_token, expiresIn);
          resolve(true);
        } else {
          console.error('Sign-in failed - no access token received:', response);
          resolve(false);
        }
      };

      // Request access token with specific prompt
      tokenClient.requestAccessToken({
        prompt: 'consent',
        hint: 'select_account'
      });
    });
  } catch (error) {
    console.error('Failed to sign in:', error);
    return false;
  }
};

// Sign out from Google
export const signOut = async (): Promise<void> => {
  if (accessToken && (window as any).google?.accounts?.oauth2) {
    try {
      (window as any).google.accounts.oauth2.revoke(accessToken);
    } catch (error) {
      console.error('Failed to revoke token:', error);
    }
  }
  clearTokenFromStorage();
};

// Get user's calendars
export const getCalendars = async () => {
  try {
    if (!(await ensureValidToken())) {
      throw new Error('User not signed in or token expired');
    }

    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Failed to get calendars:', error);
    throw error;
  }
};

// Get events from calendar within date range
export const getEvents = async (
  calendarId: string = 'primary',
  timeMin: Date,
  timeMax: Date
) => {
  try {
    if (!(await ensureValidToken())) {
      throw new Error('User not signed in or token expired');
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?` +
      `timeMin=${timeMin.toISOString()}&` +
      `timeMax=${timeMax.toISOString()}&` +
      `singleEvents=true&` +
      `orderBy=startTime`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Failed to get events:', error);
    throw error;
  }
};

// Create a new event in calendar
export const createEvent = async (
  calendarEvent: CalendarEvent,
  taskTitle: string,
  calendarId: string = 'primary'
) => {
  try {
    console.log('createEvent: Checking token validity...');
    if (!(await ensureValidToken())) {
      throw new Error('User not signed in or token expired');
    }
    console.log('createEvent: Token is valid');

    const event = {
      summary: `${taskTitle} (${calendarEvent.phase})`,
      description: `Task: ${taskTitle}\nPhase: ${calendarEvent.phase}`,
      start: {
        dateTime: calendarEvent.startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: calendarEvent.endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      colorId: getPhaseColorId(calendarEvent.phase)
    };

    console.log('createEvent: Creating event:', event);
    console.log('createEvent: Using token:', accessToken?.substring(0, 20) + '...');

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event)
    });

    console.log('createEvent: Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('createEvent: Error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const result = await response.json();
    console.log('createEvent: Success:', result);
    return result;
  } catch (error) {
    console.error('Failed to create event:', error);
    throw error;
  }
};

// Update an existing event
export const updateEvent = async (
  eventId: string,
  calendarEvent: CalendarEvent,
  taskTitle: string,
  calendarId: string = 'primary'
) => {
  try {
    if (!isSignedIn()) {
      throw new Error('User not signed in');
    }

    const event = {
      summary: `${taskTitle} (${calendarEvent.phase})`,
      description: `Task: ${taskTitle}\nPhase: ${calendarEvent.phase}`,
      start: {
        dateTime: calendarEvent.startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: calendarEvent.endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      colorId: getPhaseColorId(calendarEvent.phase)
    };

    const response = await gapi.client.calendar.events.update({
      calendarId: calendarId,
      eventId: eventId,
      resource: event
    });

    return response.result;
  } catch (error) {
    console.error('Failed to update event:', error);
    throw error;
  }
};

// Delete an event
export const deleteEvent = async (
  eventId: string,
  calendarId: string = 'primary'
) => {
  try {
    if (!isSignedIn()) {
      throw new Error('User not signed in');
    }

    await gapi.client.calendar.events.delete({
      calendarId: calendarId,
      eventId: eventId
    });

    return true;
  } catch (error) {
    console.error('Failed to delete event:', error);
    throw error;
  }
};

// Get color ID for task phase
const getPhaseColorId = (phase: string): string => {
  const colorMap: Record<string, string> = {
    incubation: '1',    // Blue
    design: '2',        // Green
    implementation: '3', // Purple
    improvement: '4'    // Red
  };
  return colorMap[phase] || '1';
};

// Check if time slot is available
export const isTimeSlotAvailable = async (
  startTime: Date,
  endTime: Date,
  calendarId: string = 'primary'
): Promise<boolean> => {
  try {
    const events = await getEvents(calendarId, startTime, endTime);
    
    // Check for overlapping events
    for (const event of events) {
      if (!event.start?.dateTime || !event.end?.dateTime) continue;
      
      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);
      
      // Check for overlap
      if (startTime < eventEnd && endTime > eventStart) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Failed to check time slot availability:', error);
    return false;
  }
};

// Get current user info
export const getCurrentUser = async () => {
  if (!(await ensureValidToken())) {
    return null;
  }

  try {
    // Try the userinfo endpoint first
    let response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    // If userinfo fails, try the People API
    if (!response.ok) {
      response = await fetch('https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,photos', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const peopleData = await response.json();
        return {
          id: peopleData.resourceName,
          name: peopleData.names?.[0]?.displayName || 'Unknown',
          email: peopleData.emailAddresses?.[0]?.value || 'Unknown',
          imageUrl: peopleData.photos?.[0]?.url || ''
        };
      }
    } else {
      const userInfo = await response.json();
      return {
        id: userInfo.id,
        name: userInfo.name,
        email: userInfo.email,
        imageUrl: userInfo.picture
      };
    }

    throw new Error(`HTTP error! status: ${response.status}`);
  } catch (error) {
    console.error('Failed to get user info:', error);
    return null;
  }
};

// Declare global gapi type
declare global {
  interface Window {
    gapi: any;
  }
}

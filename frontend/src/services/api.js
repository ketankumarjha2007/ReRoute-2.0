const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export async function getCities() {
  const res = await fetch(`${BASE_URL}/cities`);
  if (!res.ok) {
    throw new Error(`Failed to fetch cities: ${res.statusText}`);
  }
  return res.json();
}

export async function getPois(cityId, category = '') {
  let url = `${BASE_URL}/pois?city_id=${encodeURIComponent(cityId)}`;
  if (category) {
    url += `&category=${encodeURIComponent(category)}`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch POIs: ${res.statusText}`);
  }
  return res.json();
}

export async function optimizeItinerary(payload) {
  const res = await fetch(`${BASE_URL}/optimize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Optimization failed: ${res.statusText}`);
  }
  return res.json();
}

export async function parseIntent(prompt) {
  const res = await fetch(`${BASE_URL}/explain/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Failed to parse prompt: ${res.statusText}`);
  }
  return res.json();
}

export async function planMyDay(prompt, cityId = null) {
  const res = await fetch(`${BASE_URL}/explain/plan-my-day`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, city_id: cityId })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Failed to generate AI plan: ${res.statusText}`);
  }
  return res.json();
}

export const planMyDayWithAi = planMyDay;

export async function explainPlan(payload) {
  const res = await fetch(`${BASE_URL}/explain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Failed to generate explanation: ${res.statusText}`);
  }
  return res.json();
}

export const explainResult = explainPlan;

export async function submitContact(payload) {
  const accessKey = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY;

  const formData = new FormData();

  formData.append('access_key', accessKey);
  formData.append('name', payload.name);
  formData.append('email', payload.email);
  formData.append('message', payload.message);
  formData.append('subject', 'New ReRoute Contact Message');

  const res = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    body: formData
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to submit message.');
  }

  return {
    success: true,
    message: 'Your message has been sent successfully.'
  };
}
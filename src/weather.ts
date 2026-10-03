export type Weather = {
  temperature: number;
  feelsLike: number;
  humidity: number;
  precipitation: number;
  cloudCover: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
  code: number;
  description: string;
  fetchedAt: string;
  source: string;
};

const CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
};

export const describeWeather = (code: number) => CODES[code] ?? 'Unknown';

export const compass = (deg: number) =>
  ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];

/** Fetch current conditions from Open-Meteo (free, no API key). */
export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: [
      'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'precipitation',
      'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'weather_code',
    ].join(','),
    wind_speed_unit: 'mph',
    timezone: 'auto',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  const c = (await res.json()).current;
  return {
    temperature: c.temperature_2m,
    feelsLike: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    precipitation: c.precipitation,
    cloudCover: c.cloud_cover,
    pressure: c.pressure_msl,
    windSpeed: c.wind_speed_10m,
    windDirection: c.wind_direction_10m,
    code: c.weather_code,
    description: describeWeather(c.weather_code),
    fetchedAt: new Date().toISOString(),
    source: 'Open-Meteo',
  };
}

/** Resolve the device position, or null if unavailable/denied. */
export function getDevicePosition(timeout = 8000): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout, maximumAge: 5 * 60 * 1000 },
    );
  });
}

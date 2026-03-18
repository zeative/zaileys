export async function locationTransformer(payload: any) {
  const location = payload.location
  if (!location) return payload

  // Support shorthand { location: [lat, lng] }
  if (Array.isArray(location)) {
    return {
      ...payload,
      location: {
        degreesLatitude: location[0],
        degreesLongitude: location[1]
      }
    }
  }

  return payload
}

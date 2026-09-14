export interface Appointment {
  id: string
  patientName: string
  phone: string
  doctor: string
  startsAt: Date
}

export async function appointmentsTomorrow(): Promise<Appointment[]> {
  return []
}

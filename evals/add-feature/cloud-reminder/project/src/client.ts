import { Client } from 'zaileys'

export const client = new Client({
  provider: 'cloud',
  cloud: {
    accessToken: process.env.WA_TOKEN!,
    phoneNumberId: process.env.WA_PHONE_ID!,
    verifyToken: process.env.WA_VERIFY_TOKEN!,
    appSecret: process.env.WA_APP_SECRET!,
  },
})

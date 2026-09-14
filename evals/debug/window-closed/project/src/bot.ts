import { Client } from 'zaileys'

export const client = new Client({
  provider: 'cloud',
  cloud: {
    accessToken: process.env.WA_ACCESS_TOKEN!,
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID!,
    verifyToken: process.env.WA_VERIFY_TOKEN!,
    appSecret: process.env.WA_APP_SECRET!,
  },
})

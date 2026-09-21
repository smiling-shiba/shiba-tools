import { definePolicy } from '../stub-sdk.ts'

console.log('a policy that prints while loading')
export default definePolicy({ id: 'noisy' })

import { main } from './cli.ts'

process.exitCode = main(process.argv.slice(2), {
  out: (text) => console.log(text),
  err: (text) => console.error(text),
})

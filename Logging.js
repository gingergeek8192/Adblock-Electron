import { inspect } from 'node:util'

const Log = {
    _log(title, report) {
        if (!this.withConsole) return

        const divider = '─'.repeat(72)

        console.log(
            `\n${divider}\n  ${title}\n${divider}\n` +
            inspect(report, {
                colors: true,
                depth: null,
                compact: 3,
                breakLength: 100
            }) +
            `\n${divider}\n`
        )
    }
}

export default Log
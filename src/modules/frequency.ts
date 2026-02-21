import { Context } from 'koishi'
import { Config } from '../config'
import { getCommandFrequencyRecord, updateCommandFrequencyRecord, CommandFrequencyRecord } from '../database'

export const name = 'group-control-frequency'

function isCurrentlyBlocked(record: CommandFrequencyRecord | null): boolean {
    if (!record || !record.blockExpiryTime) return false;
    return Date.now() < record.blockExpiryTime * 1000;
}

export function apply(ctx: Context, config: Config) {
    if (!config.frequency.enabled) return;

    ctx.on('command/before-execute', async (argv) => {
        const session = argv.session;
        if (!session.guildId || !config.frequency.enabled) return;
        const { guildId, platform } = session;
        if (config.frequency.whitelist && config.frequency.whitelist.includes(guildId)) return;

        let record = await getCommandFrequencyRecord(ctx, platform, guildId);
        const now = Math.floor(Date.now() / 1000);
        const windowStart = now - config.frequency.window;

        if (record && record.lastCommandTime < windowStart) {
            // Window expired
            if (record.warningSent && record.firstWarningTime > 0 && now - record.firstWarningTime <= config.frequency.warnDelay) {
                record.commandCount = 1; record.lastCommandTime = now;
            } else if (isCurrentlyBlocked(record) && Date.now() < record.blockExpiryTime * 1000) {
                // Still blocked
            } else {
                // Reset
                record = { platform, guildId, commandCount: 1, lastCommandTime: now, warningSent: false, blockExpiryTime: 0, firstWarningTime: 0 };
            }
        } else if (!record) {
            record = { platform, guildId, commandCount: 1, lastCommandTime: now, warningSent: false, blockExpiryTime: 0, firstWarningTime: 0 };
        } else {
            record.commandCount += 1;
            record.lastCommandTime = now;
        }

        if (isCurrentlyBlocked(record)) {
            try {
                const remainingTime = Math.ceil((record.blockExpiryTime * 1000 - Date.now()) / 1000);
                await session.bot.sendMessage(guildId, config.frequency.blockedMsg.replace('{time}', remainingTime.toString()), platform);
            } catch (e) { }
            throw new Error('Blocked');
        }

        if (record.commandCount > config.frequency.limit) {
            if (!record.warningSent) {
                try { await session.bot.sendMessage(guildId, config.frequency.warnMsg, platform); } catch (e) { }
                record.warningSent = true; record.commandCount = 1; record.lastCommandTime = now; record.firstWarningTime = now;
                await updateCommandFrequencyRecord(ctx, platform, guildId, record);
                throw new Error('Warning');
            } else {
                record.blockExpiryTime = now + config.frequency.blockDur;
                record.warningSent = false; record.commandCount = 0; record.firstWarningTime = 0;
                await updateCommandFrequencyRecord(ctx, platform, guildId, record);
                try { await session.bot.sendMessage(guildId, config.frequency.blockMsg.replace('{duration}', config.frequency.blockDur.toString()), platform); } catch (e) { }
                throw new Error('Blocked');
            }
        }
        await updateCommandFrequencyRecord(ctx, platform, guildId, record);
    });
}

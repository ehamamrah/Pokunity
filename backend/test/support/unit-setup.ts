import { Logger } from '@nestjs/common';

// Unit tests assert behaviour, not log output.
Logger.overrideLogger(false);

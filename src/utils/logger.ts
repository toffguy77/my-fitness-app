/**
 * Система логирования с поддержкой разных уровней
 * Поддерживает как клиентскую, так и серверную среду
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4,
}

type LogContext = {
    [key: string]: unknown;
};

class Logger {
    private level: LogLevel;
    private isDevelopment: boolean;
    private isClient: boolean;

    constructor() {
        // Определяем среду выполнения
        this.isClient = typeof window !== 'undefined';
        this.isDevelopment = process.env.NODE_ENV === 'development';

        // Получаем уровень логирования из переменных окружения
        const envLevel = this.isClient
            ? process.env.NEXT_PUBLIC_LOG_LEVEL
            : process.env.LOG_LEVEL;

        // По умолчанию: DEBUG в development, INFO в production
        const defaultLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;

        this.level = this.parseLogLevel(envLevel) ?? defaultLevel;
    }

    private parseLogLevel(level?: string): LogLevel | null {
        if (!level) return null;

        const upperLevel = level.toUpperCase();
        switch (upperLevel) {
            case 'DEBUG':
                return LogLevel.DEBUG;
            case 'INFO':
                return LogLevel.INFO;
            case 'WARN':
                return LogLevel.WARN;
            case 'ERROR':
                return LogLevel.ERROR;
            case 'NONE':
                return LogLevel.NONE;
            default:
                return null;
        }
    }

    private formatMessage(level: string, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` ${JSON.stringify(context)}` : '';
        return `[${timestamp}] [${level}] ${message}${contextStr}`;
    }

    private shouldLog(level: LogLevel): boolean {
        return level >= this.level;
    }

    private log(level: LogLevel, levelName: string, message: string, context?: LogContext, error?: Error): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const formattedMessage = this.formatMessage(levelName, message, context);
        const logData: unknown[] = [formattedMessage];

        if (error) {
            logData.push(error);
        }

        // Используем соответствующий метод консоли
        switch (level) {
            case LogLevel.DEBUG:
                if (this.isClient) {
                    console.debug(...logData);
                } else {
                    console.debug(...logData);
                }
                break;
            case LogLevel.INFO:
                console.info(...logData);
                break;
            case LogLevel.WARN:
                console.warn(...logData);
                break;
            case LogLevel.ERROR:
                console.error(...logData);
                break;
        }
    }

    /**
     * Логирование отладочной информации
     * Используется для детальной отладки приложения
     */
    debug(message: string, context?: LogContext): void {
        this.log(LogLevel.DEBUG, 'DEBUG', message, context);
    }

    /**
     * Логирование информационных сообщений
     * Используется для отслеживания нормального потока выполнения
     */
    info(message: string, context?: LogContext): void {
        this.log(LogLevel.INFO, 'INFO', message, context);
    }

    /**
     * Логирование предупреждений
     * Используется для ситуаций, которые могут привести к проблемам
     */
    warn(message: string, context?: LogContext): void {
        this.log(LogLevel.WARN, 'WARN', message, context);
    }

    /**
     * Логирование ошибок
     * Используется для критических ошибок и исключений
     */
    error(message: string, error?: Error | unknown, context?: LogContext): void {
        let errorObj: Error | undefined;

        if (error instanceof Error) {
            errorObj = error;
        } else if (error) {
            errorObj = new Error(String(error));
        }

        this.log(LogLevel.ERROR, 'ERROR', message, context, errorObj);
    }

    /**
     * Создает дочерний логгер с дополнительным контекстом
     * Полезно для логирования в определенных модулях или компонентах
     */
    child(context: LogContext): Logger {
        const childLogger = new Logger();
        const originalLog = childLogger.log.bind(childLogger);

        childLogger.log = (level: LogLevel, levelName: string, message: string, childContext?: LogContext, error?: Error) => {
            const mergedContext = { ...context, ...childContext };
            originalLog(level, levelName, message, mergedContext, error);
        };

        return childLogger;
    }

    /**
     * Получить текущий уровень логирования
     */
    getLevel(): LogLevel {
        return this.level;
    }

    /**
     * Установить уровень логирования программно
     */
    setLevel(level: LogLevel): void {
        this.level = level;
    }
}

// Экспортируем singleton экземпляр
export const logger = new Logger();

// Экспортируем класс для создания кастомных логгеров
export { Logger };



import * as nanospinner from 'nanospinner';
import makeWASocket from 'baileys';
import NodeCache from 'node-cache';
import z$2, { z } from 'zod/v4';
import { z as z$1 } from 'zod';

interface Store {
    read: (id: string) => Promise<unknown>;
    write: (obj: Record<string, unknown>) => Promise<void>;
}
interface JsonDBInterface {
    initialize(session: string): Promise<void>;
    store(key: string): Store;
    upsert(id: string, value: unknown): Promise<void>;
    read(id: string): Promise<unknown>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
    delete(): Promise<void>;
}
interface JsonDBInterface {
    initialize(session: string): Promise<void>;
    store(key: string): Store;
    upsert(id: string, value: unknown): Promise<void>;
    read(id: string): Promise<unknown>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
    delete(): Promise<void>;
}
declare class JsonDB implements JsonDBInterface {
    private session;
    private db;
    private storeDir;
    initialize(session: string): Promise<void>;
    private tryRecoverRaw;
    private chunks;
    private writeChunks;
    store(key: string): Store;
    upsert(id: string, value: unknown): Promise<void>;
    read(id: string): Promise<any>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
    delete(): Promise<void>;
}

declare const ExtractorCallsType: z.ZodObject<{
    callId: z.ZodString;
    roomId: z.ZodString;
    callerId: z.ZodString;
    date: z.ZodDate;
    offline: z.ZodBoolean;
    status: z.ZodEnum<{
        accept: "accept";
        offer: "offer";
        reject: "reject";
        ringing: "ringing";
        terminate: "terminate";
        timeout: "timeout";
    }>;
    isVideo: z.ZodBoolean;
    isGroup: z.ZodBoolean;
}, z.core.$strip>;

declare const ExtractorConnectionType: z.ZodObject<{
    status: z.ZodEnum<{
        connecting: "connecting";
        open: "open";
        close: "close";
    }>;
}, z.core.$strip>;

declare const ExtractorMessagesType: z$1.ZodObject<{
    chatId: z$1.ZodString;
    channelId: z$1.ZodString;
    uniqueId: z$1.ZodString;
    receiverId: z$1.ZodString;
    receiverName: z$1.ZodString;
    roomId: z$1.ZodString;
    roomName: z$1.ZodString;
    senderLid: z$1.ZodString;
    senderId: z$1.ZodString;
    senderName: z$1.ZodString;
    senderDevice: z$1.ZodEnum<{
        unknown: "unknown";
        android: "android";
        ios: "ios";
        desktop: "desktop";
        web: "web";
    }>;
    chatType: z$1.ZodEnum<{
        contacts: "contacts";
        event: "event";
        text: "text";
        image: "image";
        contact: "contact";
        location: "location";
        document: "document";
        audio: "audio";
        video: "video";
        protocol: "protocol";
        highlyStructured: "highlyStructured";
        sendPayment: "sendPayment";
        requestPayment: "requestPayment";
        declinePaymentRequest: "declinePaymentRequest";
        cancelPaymentRequest: "cancelPaymentRequest";
        template: "template";
        sticker: "sticker";
        groupInvite: "groupInvite";
        buttons: "buttons";
        product: "product";
        deviceSent: "deviceSent";
        list: "list";
        viewOnce: "viewOnce";
        order: "order";
        ephemeral: "ephemeral";
        invoice: "invoice";
        paymentInvite: "paymentInvite";
        interactive: "interactive";
        reaction: "reaction";
        interactiveResponse: "interactiveResponse";
        pollCreation: "pollCreation";
        pollUpdate: "pollUpdate";
        keepInChat: "keepInChat";
        requestPhoneNumber: "requestPhoneNumber";
        scheduledCallCreation: "scheduledCallCreation";
        groupMentioned: "groupMentioned";
        pinInChat: "pinInChat";
        scheduledCallEdit: "scheduledCallEdit";
        ptv: "ptv";
        botInvoke: "botInvoke";
        callLog: "callLog";
        encComment: "encComment";
        bcall: "bcall";
        lottieSticker: "lottieSticker";
        comment: "comment";
        placeholder: "placeholder";
        encEventUpdate: "encEventUpdate";
    }>;
    timestamp: z$1.ZodNumber;
    text: z$1.ZodNullable<z$1.ZodString>;
    mentions: z$1.ZodArray<z$1.ZodString>;
    links: z$1.ZodArray<z$1.ZodString>;
    isPrefix: z$1.ZodBoolean;
    isSpam: z$1.ZodBoolean;
    isFromMe: z$1.ZodBoolean;
    isTagMe: z$1.ZodBoolean;
    isGroup: z$1.ZodBoolean;
    isStory: z$1.ZodBoolean;
    isViewOnce: z$1.ZodBoolean;
    isEdited: z$1.ZodBoolean;
    isDeleted: z$1.ZodBoolean;
    isPinned: z$1.ZodBoolean;
    isUnPinned: z$1.ZodBoolean;
    isChannel: z$1.ZodBoolean;
    isBroadcast: z$1.ZodBoolean;
    isEphemeral: z$1.ZodBoolean;
    isForwarded: z$1.ZodBoolean;
    citation: z$1.ZodNullable<z$1.ZodRecord<z$1.ZodString, z$1.ZodBoolean>>;
    media: z$1.ZodNullable<z$1.ZodObject<{
        buffer: z$1.ZodFunction<z$1.core.$ZodFunctionArgs, z$1.core.$ZodFunctionOut>;
        stream: z$1.ZodFunction<z$1.core.$ZodFunctionArgs, z$1.core.$ZodFunctionOut>;
    }, z$1.core.$loose>>;
    message: z$1.ZodFunction<z$1.ZodTuple<readonly [], null>, z$1.ZodRecord<z$1.ZodString, z$1.ZodAny>>;
    replied: z$1.ZodNullable<z$1.ZodObject</*elided*/ any, z$1.core.$strip>>;
}, z$1.core.$strip>;

type ExtractZod<T> = T extends z.ZodTypeAny ? z.infer<T> : never;

declare const PluginsType: z$2.ZodOptional<z$2.ZodArray<z$2.ZodObject<{
    necessary: z$2.ZodString;
}, z$2.core.$loose>>>;
declare const LimiterType: z$2.ZodOptional<z$2.ZodObject<{
    durationMs: z$2.ZodNumber;
    maxMessages: z$2.ZodNumber;
}, z$2.core.$strip>>;
declare const CitationType: z$2.ZodOptional<z$2.ZodRecord<z$2.ZodString & z$2.core.$partial, z$2.ZodArray<z$2.ZodNumber>>>;
declare const FakeReplyType: z$2.ZodOptional<z$2.ZodObject<{
    provider: z$2.ZodEnum<{
        [x: string]: string;
    }>;
}, z$2.core.$strip>>;
declare const ClientBaseType: z$2.ZodObject<{
    session: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodString>>;
    prefix: z$2.ZodOptional<z$2.ZodString>;
    ignoreMe: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    showLogs: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoMentions: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoOnline: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoRead: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoPresence: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoRejectCall: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    plugins: z$2.ZodOptional<z$2.ZodArray<z$2.ZodObject<{
        necessary: z$2.ZodString;
    }, z$2.core.$loose>>>;
    limiter: z$2.ZodOptional<z$2.ZodObject<{
        durationMs: z$2.ZodNumber;
        maxMessages: z$2.ZodNumber;
    }, z$2.core.$strip>>;
    citation: z$2.ZodOptional<z$2.ZodRecord<z$2.ZodString & z$2.core.$partial, z$2.ZodArray<z$2.ZodNumber>>>;
    fakeReply: z$2.ZodOptional<z$2.ZodObject<{
        provider: z$2.ZodEnum<{
            [x: string]: string;
        }>;
    }, z$2.core.$strip>>;
}, z$2.core.$strip>;
declare const ClientAuthPairingType: z$2.ZodObject<{
    authType: z$2.ZodLiteral<"pairing">;
    phoneNumber: z$2.ZodNumber;
}, z$2.core.$strip>;
declare const ClientAuthQRType: z$2.ZodObject<{
    authType: z$2.ZodLiteral<"qr">;
}, z$2.core.$strip>;
declare const ClientOptionsType: z$2.ZodDiscriminatedUnion<[z$2.ZodObject<{
    authType: z$2.ZodLiteral<"pairing">;
    phoneNumber: z$2.ZodNumber;
    session: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodString>>;
    prefix: z$2.ZodOptional<z$2.ZodString>;
    ignoreMe: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    showLogs: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoMentions: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoOnline: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoRead: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoPresence: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoRejectCall: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    plugins: z$2.ZodOptional<z$2.ZodArray<z$2.ZodObject<{
        necessary: z$2.ZodString;
    }, z$2.core.$loose>>>;
    limiter: z$2.ZodOptional<z$2.ZodObject<{
        durationMs: z$2.ZodNumber;
        maxMessages: z$2.ZodNumber;
    }, z$2.core.$strip>>;
    citation: z$2.ZodOptional<z$2.ZodRecord<z$2.ZodString & z$2.core.$partial, z$2.ZodArray<z$2.ZodNumber>>>;
    fakeReply: z$2.ZodOptional<z$2.ZodObject<{
        provider: z$2.ZodEnum<{
            [x: string]: string;
        }>;
    }, z$2.core.$strip>>;
}, z$2.core.$strip>, z$2.ZodObject<{
    authType: z$2.ZodLiteral<"qr">;
    session: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodString>>;
    prefix: z$2.ZodOptional<z$2.ZodString>;
    ignoreMe: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    showLogs: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoMentions: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoOnline: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoRead: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoPresence: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    autoRejectCall: z$2.ZodOptional<z$2.ZodDefault<z$2.ZodBoolean>>;
    plugins: z$2.ZodOptional<z$2.ZodArray<z$2.ZodObject<{
        necessary: z$2.ZodString;
    }, z$2.core.$loose>>>;
    limiter: z$2.ZodOptional<z$2.ZodObject<{
        durationMs: z$2.ZodNumber;
        maxMessages: z$2.ZodNumber;
    }, z$2.core.$strip>>;
    citation: z$2.ZodOptional<z$2.ZodRecord<z$2.ZodString & z$2.core.$partial, z$2.ZodArray<z$2.ZodNumber>>>;
    fakeReply: z$2.ZodOptional<z$2.ZodObject<{
        provider: z$2.ZodEnum<{
            [x: string]: string;
        }>;
    }, z$2.core.$strip>>;
}, z$2.core.$strip>], "authType">;
declare const EventEnumType: z$2.ZodEnum<{
    connection: "connection";
    messages: "messages";
    calls: "calls";
    webhooks: "webhooks";
}>;
type EventCallbackType = {
    connection: (ctx: ExtractZod<typeof ExtractorConnectionType>) => void;
    messages: (ctx: ExtractZod<typeof ExtractorMessagesType>) => void;
    calls: (ctx: ExtractZod<typeof ExtractorCallsType>) => void;
    webhooks: (ctx: ExtractZod<typeof EventEnumType>) => void;
};

declare class Client {
    props: ExtractZod<typeof ClientOptionsType>;
    db: JsonDBInterface;
    private logger;
    private events;
    private relay;
    private retryCount;
    private maxRetries;
    private connectionTimeout;
    spinner: nanospinner.Spinner;
    socket: ReturnType<typeof makeWASocket> | undefined;
    cache: NodeCache;
    constructor(props: ExtractZod<typeof ClientOptionsType>);
    initialize(): Promise<void>;
    private startConnectionTimeout;
    private handleConnectionTimeout;
    private autoReload;
    resetRetryCount(): void;
    on<T extends ExtractZod<typeof EventEnumType>>(event: T, handler: EventCallbackType[T]): void;
    emit<T extends ExtractZod<typeof EventEnumType>>(event: T, ...args: Parameters<EventCallbackType[T]>): void;
}

export { CitationType, Client, ClientAuthPairingType, ClientAuthQRType, ClientBaseType, ClientOptionsType, type EventCallbackType, EventEnumType, FakeReplyType, JsonDB, type JsonDBInterface, LimiterType, PluginsType };

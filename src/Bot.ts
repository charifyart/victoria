import { InworldClient, ServiceError, InworldPacket, InworldConnectionService } from "@inworld/nodejs-sdk";
import { Client, DMChannel, GatewayIntentBits, Message, NewsChannel, PartialDMChannel, Partials, PrivateThreadChannel, PublicThreadChannel, TextChannel, VoiceChannel } from "discord.js";
import { v4 } from 'uuid';
require('dotenv').config()


console.log("Bot is starting...");

const MAX_CONNECTIONS = 50;
const channelConnections: { [key: string]: InworldConnectionService } = {};
const directConnections: { [key: string]: InworldConnectionService } = {};


const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageTyping,
      GatewayIntentBits.DirectMessageReactions,
    ],
    partials: [Partials.Channel],
  });

discordClient.login(process.env.DISCORD_BOT_TOKEN); 

const run = async function () {
    discordClient.on('ready', () => {
      console.log("I'm ready!");
    });
  
    discordClient.on('messageCreate', async (message: Message) => {
      if (message.author.bot) return;
  
      if (message.channel instanceof DMChannel) {
        sendMessage(message, true);
      } else if (discordClient.user && message.mentions.has(discordClient.user)) {
        sendMessage(message);
      } else if (discordClient.user && message.content.includes("Victoria")) {
        sendMessage(message);
      }
      
    });
  
    discordClient.login(process.env.DISCORD_BOT_TOKEN);
  };
if (!process.env.DISCORD_BOT_TOKEN) {
    throw new Error('INWORLD_KEY env variable is required');
}
if (!process.env.INWORLD_KEY) {
  throw new Error('INWORLD_KEY env variable is required');
}

if (!process.env.INWORLD_SECRET) {
  throw new Error('INWORLD_SECRET env variable is required');
}

if (!process.env.INWORLD_SCENE) {
  throw new Error('INWORLD_SCENE env variable is required');
}

run();

const sendMessage = (message: Message, direct?: boolean) => {
  const content = message.content.replace(`<@${discordClient.user?.id}>`, '');

  const { channel } = message;

  if (!direct) {
    const id = v4();
    channelConnections[id] = createClient({
      channel,
      onDestroy: () => destroyChannelConnection(id),
    });

    return channelConnections[id].sendText(content);
  }

  if (!directConnections[channel.id]) {
    const keys = Object.keys(directConnections);
    if (keys.length >= MAX_CONNECTIONS) {
      destroyDirectConnection(keys[0]);
    }

    directConnections[channel.id] = createClient({
      channel,
      direct,
      onDestroy: () => destroyDirectConnection(channel.id),
    });
  }

  directConnections[channel.id].sendText(content);
};

const createClient = (props: {
  channel:
    | DMChannel
    | PartialDMChannel
    | NewsChannel
    | TextChannel
    | PublicThreadChannel
    | PrivateThreadChannel
    | VoiceChannel;
  direct?: boolean;
  onDestroy: () => void;
}) => {
  const { channel, direct, onDestroy } = props;

  const client = new InworldClient()
    .setApiKey({
      key: process.env.INWORLD_KEY!,
      secret: process.env.INWORLD_SECRET!,
    })
    .setConfiguration({
      capabilities: { audio: false },
      ...(!direct && { connection: { disconnectTimeout: 5 * 1000 } }),
    })
    .setScene(process.env.INWORLD_SCENE!)
    .setOnError((err: ServiceError) => console.error(`Error: ${err.message}`))
    .setOnDisconnect(onDestroy)
    .setOnMessage((packet: InworldPacket) => {
      if (!direct && packet.isInteractionEnd()) {
        client.close();
        return;
      }

      if (packet.isText() && packet.text.final) {
        channel.send(packet.text.text);
      }
    })
    .build();

  return client;
};

const destroyDirectConnection = (id: string) => {
  if (directConnections[id]?.isActive()) {
    directConnections[id].close();
  }
  delete directConnections[id];
};
const destroyChannelConnection = (id: string) => {
  if (channelConnections[id]?.isActive()) {
    channelConnections[id].close();
  }
  delete channelConnections[id];
};

const done = () => {
  discordClient.destroy();
  Object.entries(directConnections).forEach(([id]) =>
    destroyDirectConnection(id),
  );
  Object.entries(channelConnections).forEach(([id]) =>
    destroyChannelConnection(id),
  );
};

process.on('SIGINT', done);
process.on('SIGTERM', done);
process.on('SIGUSR2', done);
process.on('unhandledRejection', (err: Error) => {
  console.error(err.message);
  done();
  process.exit(1);
});
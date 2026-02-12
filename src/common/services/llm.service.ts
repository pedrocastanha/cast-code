import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ConfigService } from './config.service';

@Injectable()
export class LlmService {
  constructor(private readonly configService: ConfigService) {}

  createModel(streaming = false): BaseChatModel {
    const provider = this.configService.getProvider();

    if (provider === 'ollama') {
      return new ChatOllama({
        model: this.configService.getModel(),
        temperature: this.configService.getTemperature(),
        baseUrl: this.configService.getOllamaBaseUrl(),
      });
    }

    return new ChatOpenAI({
      modelName: this.configService.getModel(),
      temperature: this.configService.getTemperature(),
      openAIApiKey: this.configService.getApiKey(),
      streaming,
    });
  }

  createStreamingModel(): BaseChatModel {
    return this.createModel(true);
  }
}

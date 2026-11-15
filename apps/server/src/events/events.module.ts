import { Global, Module } from '@nestjs/common';
import { PORT_TOKENS } from '@relay/engine';
import { BusEventPublisher } from './bus-event-publisher';
import { DomainEventBus } from './domain-event-bus';

@Global()
@Module({
  providers: [
    DomainEventBus,
    {
      provide: PORT_TOKENS.EventPublisher,
      inject: [DomainEventBus],
      useFactory: (bus: DomainEventBus) => new BusEventPublisher(bus),
    },
  ],
  exports: [DomainEventBus, PORT_TOKENS.EventPublisher],
})
export class EventsModule {}

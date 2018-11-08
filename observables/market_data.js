const { filter, map, publish } = require('rxjs/operators');

module.exports = (ws) => {
    const market_data$ = ws.message$.pipe(
        filter(message => message.type == 'DATA' && message.subscription.type == 'MARKET_DATA'),
        map(message => message.value),
        publish()
    )

    market_data$.connect();

    return market_data$
}
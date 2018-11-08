const { filter, map, publish } = require('rxjs/operators');

module.exports = (ws) => {
    const order$ = ws.message$.pipe(
        filter(message => message.type == 'DATA' && message.subscription.type == 'ORDER'),
        map(message => message.value),
        publish()
    )

    order$.connect();

    return order$
}
const { filter, map, publish } = require('rxjs/operators');

module.exports = (ws) => {
    const order_reject$ = ws.message$.pipe(
        filter(message => message.type == 'DATA' && message.subscription.type == 'ORDER_REJECT'),
        map(message => message.value),
        publish()
    )

    order_reject$.connect();

    return order_reject$
}
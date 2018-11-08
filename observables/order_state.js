const createTree                        = require("functional-red-black-tree")
const { publishBehavior, filter, map }  = require('rxjs/operators');
const { PRICE_SCALE }                   = require('../constants');

module.exports = (ws) => {
    const order_state$ = ws.message$.pipe(
        filter(message => message.type == 'DATA' && message.subscription.type == 'ORDER'),
        map(message => {
            let order_tree = createTree();

            for (let order of message.value)
            {
                const price = Math.round(parseFloat(order.price) * PRICE_SCALE);

                order_tree = order_tree.insert(price, order);
            }

            return order_tree;
        }),
        publishBehavior(createTree())
    )

    order_state$.connect();

    return order_state$
}
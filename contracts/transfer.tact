import "@stdlib/deploy";

const MINIMAL_CONTRACT_BALANCE: Int = ton("0.01");
const PAY_TON_COST: Int = ton("0.00012361");

message(0x7362d09c) JettonTransferNotification {
    query_id: Int as uint64; // arbitrary request number
    amount: Int as coins; // amount of jettons to transfer
    sender: Address; // address of the sender of the jettons
    forward_payload: Slice as remaining; // optional custom payload
}

message(0x0f8a7ea5) JettonTransfer {
    query_id: Int as uint64; // arbitrary request number
    amount: Int as coins; // amount of jettons to transfer
    destination: Address; // address of the new owner of the jettons
    response_destination: Address; // address where to send a response with confirmation of a successful transfer and the rest of the incoming message Toncoins.
    custom_payload: Cell?; // optional custom payload
    forward_ton_amount: Int as coins; // the amount of nanotons to be sent to the destination address.
    forward_payload: Slice as remaining; // optional custom data that should be sent to the destination address.
}

message Withdraw {
    amount: Int as coins; // amount of jettons to withdraw
}


message PayTon {
    query_id: Int as uint64;
    amount: Int as uint64;
    recipient: Address;
}

struct PaymentUSDTEvent {
    query_id: Int as uint64;
    amount: Int as coins; 
    source: Address;
    destination: Address;
}

struct PaymentTONEvent {
    query_id: Int as uint64;
    amount: Int as coins; 
    source: Address;
    destination: Address;
}

contract Transfer with Deployable {
    owner: Address;
    
    init(owner: Address) {
        self.owner = owner;
    }
 

    receive(msg:Withdraw){
        let ctx: Context = context(); // Check sender

         nativeReserve(
            MINIMAL_CONTRACT_BALANCE
        , 0);

        require(ctx.sender == self.owner, "Only owner can withdraw");
        send(SendParameters{
            to: ctx.sender,
            value: msg.amount,
            mode: SendIgnoreErrors,
            bounce: false,
            body: emptyCell()
        });
    }

    // Method for manually sending native TONs to different recipients
    receive(msg: PayTon) {

        let ctx: Context = context();
        
        nativeReserve(
            max(MINIMAL_CONTRACT_BALANCE, myBalance() - ctx.value)
        , 0);

        send(SendParameters
        {
            to: msg.recipient,
            value: PAY_TON_COST + msg.amount,
            mode: SendPayGasSeparately | SendIgnoreErrors,
            bounce: false
        });

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors,
            bounce: false,
        });

         emit(PaymentTONEvent{
            query_id: msg.query_id,
            amount: msg.amount,
            source: ctx.sender,
            destination: msg.recipient,
        }.toCell());

        dump("Pay Ton Done");

    }

    receive(msg: JettonTransferNotification) {
        let ctx: Context = context(); // Check sender
        let remianValue: Int = ctx.value;

        let payload: Slice = msg.forward_payload;

        let amount: Int = 0;
        
        let receiver: Address = self.owner;
        
        if (!payload.empty()) {
            amount = payload.loadUint(64);  
            receiver = payload.loadAddress();  

            let emptySlice: Slice = emptySlice();     
             send(SendParameters{
                to: ctx.sender,
                value: ton("0.06"),
                mode: SendIgnoreErrors,
                bounce: false,
                body: JettonTransfer{
                    query_id: msg.query_id,
                    amount: amount,
                    destination: receiver,
                    response_destination: msg.sender,
                    forward_ton_amount: 0,
                    forward_payload: emptySlice
                }.toCell()
            });

            send(SendParameters{
                to: msg.sender,
                value: remianValue,
                mode: SendIgnoreErrors,
                bounce: false,
                body: emptyCell()
            });

            emit(PaymentUSDTEvent{
                query_id: msg.query_id,
                amount: amount,
                source: self.owner,
                destination: receiver,
            }.toCell());

            dump("Pay USDT Done");
        }
    }

    get fun owner(): Address {
        return self.owner;
    }
}
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { address, Address, beginCell, Cell, fromNano, Slice, toNano } from '@ton/core';
import '@ton/test-utils';

import { Transfer, loadPaymentTONEvent, loadPaymentUSDTEvent } from '../wrappers/Transfer';
import { UsdtJettonMaster } from '../wrappers/USDT_JettonMaster';
import { UsdtJettonWallet } from '../build/USDT/tact_UsdtJettonWallet';

const storeAddresses = (addresses: any[]) => {
    let allCount = addresses.length;
    let refs = [];
    let cells = [];
    let currentCell = beginCell();
    let currentRef = beginCell();

    for (let i = 0; i < addresses.length; i++) {
        let currentCount = i + 1;
        const address = addresses[i].address;
        const amount = addresses[i].amount;
        currentCell.storeUint(amount, 64).storeAddress(address);
        if (currentCount === allCount) {
            currentCell.endCell();
            cells.push(currentCell);
        }
        else if (currentCount % 3 === 0) {
            currentCell.endCell();
            cells.push(currentCell);
            currentCell = beginCell();
        }
    }

    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        currentRef.storeRef(cell);
        if ((i + 1) % 3 === 0) {
            refs.unshift(currentRef);
            currentRef = beginCell();
        } else if (i === cells.length - 1) {
            refs.unshift(currentRef);
        }
    }

    let current = refs[0].endCell();
    for (let i = 0; i < refs.length - 1; i++) {
        let nextRef = refs[i + 1];
        nextRef.storeRef(current);
        current = nextRef.endCell();
    }

    const commentCell = beginCell()
        .storeBit(1)
        .storeRef(
            beginCell()
                .storeUint(0, 32)               // 预留32位用于标识
                .storeStringTail('')       // 存储评论内容
                .endCell(),
        )
        .endCell();

    let topCurrentCell = beginCell()
        .storeUint(allCount, 64)
        .storeRef(current)
        .storeMaybeRef(commentCell)
        .endCell();

    return topCurrentCell;

};
describe('Transfer', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let usdtJetton: SandboxContract<UsdtJettonMaster>;
    let transfer: SandboxContract<Transfer>;

    let senderWallet: SandboxContract<TreasuryContract>;
    let recipientWallet: SandboxContract<TreasuryContract>;


    beforeAll(async () => {
        let cell = new Cell();

        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        senderWallet = await blockchain.treasury('senderWallet');
        recipientWallet = await blockchain.treasury('recipientWallet');

        await deployer.send({
            value: toNano('1000'),
            to: senderWallet.address,
        });

        usdtJetton = blockchain.openContract(await UsdtJettonMaster.fromInit(deployer.address, cell));

        transfer = blockchain.openContract(await Transfer.fromInit(deployer.address));

        await transfer.send(
            deployer.getSender(),
            {
                value: toNano('10'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        await usdtJetton.send(
            deployer.getSender(),
            {
                value: toNano('1'),
            },
            'Mint:10000000000',
        );

    });

    it('should pay usdt success!', async () => {

        const toDataAddress = await usdtJetton.getGetWalletAddress(recipientWallet.address);
        const senderWalletAddress = await usdtJetton.getGetWalletAddress(deployer.address);
        const senderWallet = blockchain.openContract(UsdtJettonWallet.fromAddress(senderWalletAddress));

        
        const pay_amount = BigInt(1000)
        const forward_payload = storeAddresses([
            {
                amount: pay_amount,
                address: recipientWallet.address,
            }
        ]);

        const res = await senderWallet.send(
            deployer.getSender(),
            {
                value: toNano('1'),
            },
            {
                $$type: 'JettonTransfer',
                amount: pay_amount,
                query_id: 1n,
                destination: transfer.address,
                response_destination: deployer.address,
                forward_ton_amount: toNano(2 * 0.07),
                custom_payload: null,
                forward_payload: forward_payload.asSlice(),
            },
        );

        const paymentEvent = res.externals[0].body;
        const paymentEventStruct = loadPaymentUSDTEvent(paymentEvent.asSlice())
        console.log(paymentEventStruct);

        const toDataContract = await blockchain
            .openContract(UsdtJettonWallet.fromAddress(toDataAddress))
            .getGetWalletData();
        expect(toDataContract.balance).toBe(BigInt(1000));

    });

    // it('should pay ton success!', async () => {


    //     // let sender_balance1 = await senderWallet.getBalance()
    //     // console.log('sender_balance11:', sender_balance1.toString())

    //     // let recipient_balance1 = await recipientWallet.getBalance()
    //     // console.log('recipient_balance11:', recipient_balance1.toString())

    //     let pay_amount = toNano(100)
    //     let destination_address = recipientWallet.address;

    //     let res = await transfer.send(
    //         senderWallet.getSender(),
    //         {
    //             value: pay_amount + toNano('0.3')
    //         },
    //         {
    //             $$type: 'PayTon',
    //             query_id: BigInt(1),
    //             amount: pay_amount,
    //             recipient: destination_address
    //         }
    //     )

    //     const event = res.externals[0].body;
    //     const eventStruct = loadPaymentTONEvent(event.asSlice())
    //     console.log(eventStruct);

    //     let sender_balance = await senderWallet.getBalance()
    //     console.log('sender_balance:', sender_balance.toString())

    //     let recipient_balance = (await recipientWallet.getBalance()).toString()
    //     console.log('recipient_balance:', recipient_balance.toString())
    // });
});

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { address, Address, beginCell, Cell, fromNano, Slice, toNano } from '@ton/core';
import '@ton/test-utils';

import { Transfer, loadPaymentTONEvent, loadPaymentUSDTEvent } from '../wrappers/Transfer';
import { UsdtJettonMaster } from '../wrappers/USDT_JettonMaster';
import { UsdtJettonWallet } from '../build/USDT/tact_UsdtJettonWallet';


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

        const sender_USDT_Wallet_Address = await usdtJetton.getGetWalletAddress(deployer.address);
        const sender_USDT_Wallet = blockchain.openContract(UsdtJettonWallet.fromAddress(sender_USDT_Wallet_Address));

        let forward_payload = beginCell();
            forward_payload
                .storeUint(1000n, 64)
                .storeAddress(recipientWallet.address);
            forward_payload.endCell();

        const res = await sender_USDT_Wallet.send(
            deployer.getSender(),
            {
                value: toNano('0.14'),
            },
            {
                $$type: 'JettonTransfer',
                amount: 1000n,
                query_id: 1n,
                destination: transfer.address,
                response_destination: deployer.address,
                forward_ton_amount: toNano(0.07),
                custom_payload: null,
                forward_payload: forward_payload.asSlice(),
            },
        );

        const event = res.externals[0].body;
        const eventStruct = loadPaymentUSDTEvent(event.asSlice())
        console.log(eventStruct);

        const toDataAddress = await usdtJetton.getGetWalletAddress(recipientWallet.address);
        const toDataContract = await blockchain
            .openContract(UsdtJettonWallet.fromAddress(toDataAddress))
            .getGetWalletData();
        
        expect(toDataContract.balance).toBe(BigInt(1000));

    });

    it('should pay ton success!', async () => {


        let sender_balance1 = await senderWallet.getBalance()
        console.log('sender_balance11:', sender_balance1.toString())

        let recipient_balance1 = await recipientWallet.getBalance()
        console.log('recipient_balance11:', recipient_balance1.toString())
        

        let res = await transfer.send(
            senderWallet.getSender(),
            {
                value: toNano(100) + toNano('0.3')
            },
            {
                $$type: 'PayTon',
                query_id: BigInt(1),
                amount: 100000000000n,
                recipient: recipientWallet.address
            }
        )
        
        const event = res.externals[0].body;
        const eventStruct = loadPaymentTONEvent(event.asSlice())
        console.log(eventStruct);

        let sender_balance = await senderWallet.getBalance()
        console.log('sender_balance:', sender_balance.toString())

        let recipient_balance = (await recipientWallet.getBalance()).toString()
        console.log('recipient_balance:', recipient_balance.toString())


    });

});
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, fromNano, Slice, toNano } from '@ton/core';
import '@ton/test-utils';

import { loadPaymentEvent, MultiTransfer } from '../wrappers/MultiTransfer';
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

describe('MultiTransfer', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let usdtJetton: SandboxContract<UsdtJettonMaster>;
    let multiTransfer: SandboxContract<MultiTransfer>;
    let toWallet: SandboxContract<TreasuryContract>;
    let feeWallet: SandboxContract<TreasuryContract>;

    // const getTonBalance = async (address: Address) => {
    //     const contractInfo = await blockchain.getContract(address);
    //     return contractInfo.balance;
    // };

    beforeAll(async () => {
        let cell = new Cell();

        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        toWallet = await blockchain.treasury('toWallet');
        feeWallet = await blockchain.treasury('feeWallet');

        await deployer.send({
            value: toNano('1000000000'),
            to: toWallet.address,
        });

        await deployer.send({
            value: toNano('1'),
            to: feeWallet.address,
        });

        usdtJetton = blockchain.openContract(await UsdtJettonMaster.fromInit(deployer.address, cell));

        multiTransfer = blockchain.openContract(await MultiTransfer.fromInit(deployer.address));

        await multiTransfer.send(
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

    it('should pay success!', async () => {

        const toDataAddress = await usdtJetton.getGetWalletAddress(toWallet.address);
        const feeDataAddress = await usdtJetton.getGetWalletAddress(feeWallet.address);

        const senderWalletAddress = await usdtJetton.getGetWalletAddress(deployer.address);
        const senderWallet = blockchain.openContract(UsdtJettonWallet.fromAddress(senderWalletAddress));
        
        const addresses = [];

        console.log('feeWallet.address', feeWallet.address)
        
        addresses.push({
            amount: BigInt(1000),
            address: toWallet.address,
        });

        addresses.push({
            amount: BigInt(100),
            address: feeWallet.address,
        });

        const totalAmount = addresses.reduce((acc, { amount }) => acc + amount, 0n);
        const forward_payload = storeAddresses(addresses);

        const res = await senderWallet.send(
            deployer.getSender(),
            {
                value: toNano('1'),
            },
            {
                $$type: 'JettonTransfer',
                amount: totalAmount,
                query_id: 1n,
                destination: multiTransfer.address,
                response_destination: deployer.address,
                forward_ton_amount: toNano(2 * 0.07),
                custom_payload: null,
                forward_payload: forward_payload.asSlice(),
            },
        );

        const paymentEvent = res.externals[0].body;
        const paymentEventStruct = loadPaymentEvent(paymentEvent.asSlice())
        console.log(paymentEventStruct);

        const toDataContract = await blockchain
            .openContract(UsdtJettonWallet.fromAddress(toDataAddress))
            .getGetWalletData();
        
        const feeDataContract = await blockchain
            .openContract(UsdtJettonWallet.fromAddress(feeDataAddress))
            .getGetWalletData();

        expect(toDataContract.balance).toBe(BigInt(1000));
        expect(feeDataContract.balance).toBe(BigInt(100));
    });
});
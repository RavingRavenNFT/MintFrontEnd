import React from 'react'
import { doc, getDoc, setDoc, getFirestore, collection, query, where, getDocs } from "firebase/firestore"; 
import { initializeApp } from "firebase/app";

import "../node_modules/@blueprintjs/core/lib/css/blueprint.css";
import "../node_modules/@blueprintjs/icons/lib/css/blueprint-icons.css";
import "../node_modules/normalize.css/normalize.css";
import {
    Address,
    TransactionUnspentOutput,
    TransactionUnspentOutputs,
    TransactionOutput,
    Value,
    TransactionBuilder,
    TransactionBuilderConfigBuilder,
    LinearFee,
    BigNum,
    TransactionWitnessSet,
    Transaction,

} from "@emurgo/cardano-serialization-lib-asmjs"
import "./css/App.css";
import "./css/ConnectWallet.css"
import "./css/Modal.css"
import main from "./images/main.png"
import whitelist from './whitelist.json'

let Buffer = require('buffer/').Buffer

const firebaseConfig = {  };
  
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default class App extends React.Component
{
    constructor(props)
    {
        super(props);

        this.state = {
            txHash: "",
            displayLoading: false,
            selectedTabId: "1",
            mintAmount: 1,
            hasError: false,
            errorText: "",
            isWhitelisted: false,
            whitelistName: "",
            whichWalletSelected: undefined,
            walletFound: false,
            walletIsEnabled: false,
            walletName: undefined,
            walletIcon: undefined,
            walletAPIVersion: undefined,
            wallets: [],
            walletIcons: { "nufi": "https://static.jpgstoreapis.com/icons/nufi-navbar-light.svg", 
                            "gero" : "https://static.jpgstoreapis.com/icons/gerowallet.svg", 
                            "flint" : "https://static.jpgstoreapis.com/icons/flint.svg", 
                            "nami" : "https://static.jpgstoreapis.com/icons/nami.svg", 
                            "eternl" : "https://static.jpgstoreapis.com/icons/eternl.webp", 
                            "ccvault" : "https://static.jpgstoreapis.com/icons/eternl.webp", 
                            "typhon" : "https://static.jpgstoreapis.com/icons/typhon-light.svg",
                            "typhoncip30" : "https://static.jpgstoreapis.com/icons/typhon-light.svg",
                            "yoroi" : "https://i.ibb.co/M53SbFW/yoroi.png",
                            "gerowallet" : "https://static.jpgstoreapis.com/icons/gerowallet.svg" }
                        ,

            networkId: undefined,
            Utxos: undefined,
            CollatUtxos: undefined,
            balance: undefined,
            changeAddress: undefined,
            rewardAddress: undefined,
            usedAddress: undefined,

            txBody: undefined,
            txBodyCborHex_unsigned: "",
            txBodyCborHex_signed: "",
            submittedTxHash: "",

            addressBech32SendADA: "addr_test1qrt7j04dtk4hfjq036r2nfewt59q8zpa69ax88utyr6es2ar72l7vd6evxct69wcje5cs25ze4qeshejy828h30zkydsu4yrmm",
            lovelaceToSend: 3000000,
            assetNameHex: "4c494645",
            assetPolicyIdHex: "ae02017105527c6c0c9840397a39cc5ca39fabe5b9998ba70fda5f2f",
            assetAmountToSend: 5,
            addressScriptBech32: "addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8",
            datumStr: "12345678",
            plutusScriptCborHex: "4e4d01000033222220051200120011",
            transactionIdLocked: "",
            transactionIndxLocked: 0,
            lovelaceLocked: 3000000,
            manualFee: 900000,

        }

        /**
         * When the wallet is connect it returns the connector which is
         * written to this API variable and all the other operations
         * run using this API object
         */
        this.API = undefined;

        /**
         * Protocol parameters
         * @type {{
         * keyDeposit: string,
         * coinsPerUtxoWord: string,
         * minUtxo: string,
         * poolDeposit: string,
         * maxTxSize: number,
         * priceMem: number,
         * maxValSize: number,
         * linearFee: {minFeeB: string, minFeeA: string}, priceStep: number
         * }}
         */
        this.protocolParams = {
            linearFee: {
                minFeeA: "44",
                minFeeB: "155381",
            },
            minUtxo: "34482",
            poolDeposit: "500000000",
            keyDeposit: "2000000",
            maxValSize: 5000,
            maxTxSize: 16384,
            priceMem: 0.0577,
            priceStep: 0.0000721,
            coinsPerUtxoWord: "34482",
        }

        this.pollWallets = this.pollWallets.bind(this);
    }

    /**
     * Poll the wallets it can read from the browser.
     * Sometimes the html document loads before the browser initialized browser plugins (like Nami or Flint).
     * So we try to poll the wallets 3 times (with 1 second in between each try).
     *
     * Note: CCVault and Eternl are the same wallet, Eternl is a rebrand of CCVault
     * So both of these wallets as the Eternl injects itself twice to maintain
     * backward compatibility
     *
     * @param count The current try count.
     */
    pollWallets = (count = 0) => {

        var wallets = [];
        for(const key in window.cardano) {
            if (window.cardano[key].enable && wallets.indexOf(key) === -1) {
                wallets.push(key);
            }
        }
        if (wallets.length === 0 && count < 3) {
            setTimeout(() => {
                this.pollWallets(count + 1);
            }, 1000);
            return;
        }

        this.checkIfCachedWalletStillConnected()
        const selectedWallet = localStorage.getItem('selectedWallet');

        wallets = wallets.filter(name => name !== 'ccvault') // REMOVE CCVAULT - eternl
        wallets = wallets.filter(name => name !== 'typhon') // REMOVE TYPHON - typhonCIP30 


        this.setState({
            wallets,
            whichWalletSelected: selectedWallet,
        }, () => {
                this.refreshData()
        });
        
    }

    getImageURL = (ipfsLink) => {
        const firstSeven = ipfsLink.substring(7);
        return "https://ipfs.jpgstoreapis.com/" + firstSeven;
    }



    // /**
    //  * Handles the tab selection on the user form
    //  * @param tabId
    //  */
    // handleTabId = (tabId) => this.setState({selectedTabId: tabId})

    /**
     * Handles the radio buttons on the form that
     * let the user choose which wallet to work with
     * @param obj
     */
    handleWalletSelect = (obj) => {
        const whichWalletSelected = obj.target.value
        this.setState({whichWalletSelected},
            () => {
                this.refreshData()
            })
    }

    /**
     * Handles the radio buttons on the form that
     * let the user choose which wallet to work with
     * @param obj
     */
     handleWalletSelect2 = (walletName) => {
        const whichWalletSelected = walletName
        this.setState({whichWalletSelected},
            () => {
                this.refreshData()
            })
    }

    handleOnChangeAmount = (e) => {
        this.setState({ mintAmount: e.target.value })
    }

    /**
     * Checks if the wallet is running in the browser
     * Does this for Nami, Eternl and Flint wallets
     * @returns {boolean}
     */

    checkIfWalletFound = () => {
        const walletKey = this.state.whichWalletSelected;
        const walletFound = !!window?.cardano?.[walletKey];
        this.setState({walletFound})
        return walletFound;
    }

    /**
     * Checks if a connection has been established with
     * the wallet
     * @returns {Promise<boolean>}
     */
    checkIfWalletEnabled = async () => {
        let walletIsEnabled = false;

        try {
            const walletName = this.state.whichWalletSelected;
            walletIsEnabled = await window.cardano[walletName].isEnabled();
            if (walletIsEnabled){
                localStorage.setItem('selectedWallet', walletName);
            }
        } catch (err) {
            console.log(err)
        }
        this.setState({walletIsEnabled});

        return walletIsEnabled;
    }

    checkIfCachedWalletStillConnected = async () => {
        let walletIsEnabled = false;

        try {
            const walletName = localStorage.getItem('selectedWallet');
            walletIsEnabled = await window.cardano[walletName].isEnabled();
            if (walletIsEnabled){
                localStorage.setItem('selectedWallet', walletName);
            } else {
                localStorage.removeItem('selectedWallet');
            }
        } catch (err) {
            console.log(err)
        }
        this.setState({walletIsEnabled});

        return walletIsEnabled;

    }

    /**
     * Enables the wallet that was chosen by the user
     * When this executes the user should get a window pop-up
     * from the wallet asking to approve the connection
     * of this app to the wallet
     * @returns {Promise<boolean>}
     */

    enableWallet = async () => {
        const walletKey = this.state.whichWalletSelected;
        try {
            this.API = await window.cardano[walletKey].enable();
            
        } catch(err) {
            console.log(err);
        }
        return this.checkIfWalletEnabled();
    }

    enableWallet2 = async (walletName) => {
        
        try {
            // this.setState({walletIsEnabled: false});
            this.API = await window.cardano[walletName].enable();
            console.log(JSON.stringify(this.API))
            this.setState({
                whichWalletSelected: walletName,
            }, () => {
                    this.refreshData()
            });
        } catch(err) {
            console.log(err);
        }
        // return this.checkIfWalletEnabled();
    }

    /**
     * Get the API version used by the wallets
     * writes the value to state
     * @returns {*}
     */
    getAPIVersion = () => {
        const walletKey = this.state.whichWalletSelected;
        const walletAPIVersion = window?.cardano?.[walletKey].apiVersion;
        this.setState({walletAPIVersion})
        return walletAPIVersion;
    }

    /**
     * Get the name of the wallet (nami, eternl, flint)
     * and store the name in the state
     * @returns {*}
     */

    getWalletName = () => {
        const walletKey = this.state.whichWalletSelected;
        const walletName = window?.cardano?.[walletKey].name;
        this.setState({walletName})
        return walletName;
    }

    /**
     * Gets the Network ID to which the wallet is connected
     * 0 = testnet
     * 1 = mainnet
     * Then writes either 0 or 1 to state
     * @returns {Promise<void>}
     */
    getNetworkId = async () => {
        try {
            const networkId = await this.API.getNetworkId();
            this.setState({networkId})

        } catch (err) {
            console.log(err)
        }
    }

    /**
     * Gets the UTXOs from the user's wallet and then
     * stores in an object in the state
     * @returns {Promise<void>}
     */

    getUtxos = async () => {

        let Utxos = [];

        try {
            const rawUtxos = await this.API.getUtxos();

            for (const rawUtxo of rawUtxos) {
                const utxo = TransactionUnspentOutput.from_bytes(Buffer.from(rawUtxo, "hex"));
                const input = utxo.input();
                const txid = Buffer.from(input.transaction_id().to_bytes(), "utf8").toString("hex");
                const txindx = input.index();
                const output = utxo.output();
                const amount = output.amount().coin().to_str(); // ADA amount in lovelace
                const multiasset = output.amount().multiasset();
                let multiAssetStr = "";

                if (multiasset) {
                    const keys = multiasset.keys() // policy Ids of thee multiasset
                    const N = keys.len();
                    // console.log(`${N} Multiassets in the UTXO`)


                    for (let i = 0; i < N; i++){
                        const policyId = keys.get(i);
                        const policyIdHex = Buffer.from(policyId.to_bytes(), "utf8").toString("hex");
                        // console.log(`policyId: ${policyIdHex}`)
                        const assets = multiasset.get(policyId)
                        const assetNames = assets.keys();
                        const K = assetNames.len()
                        // console.log(`${K} Assets in the Multiasset`)

                        for (let j = 0; j < K; j++) {
                            const assetName = assetNames.get(j);
                            const assetNameString = Buffer.from(assetName.name(),"utf8").toString();
                            const assetNameHex = Buffer.from(assetName.name(),"utf8").toString("hex")
                            const multiassetAmt = multiasset.get_asset(policyId, assetName)
                            multiAssetStr += `+ ${multiassetAmt.to_str()} + ${policyIdHex}.${assetNameHex} (${assetNameString})`

                        }
                    }
                }


                const obj = {
                    txid: txid,
                    txindx: txindx,
                    amount: amount,
                    str: `${txid} #${txindx} = ${amount}`,
                    multiAssetStr: multiAssetStr,
                    TransactionUnspentOutput: utxo
                }
                Utxos.push(obj);
            }
            this.setState({Utxos})
        } catch (err) {
            console.log(err)
        }
    }

   
    /**
     * Gets the current balance of in Lovelace in the user's wallet
     * This doesnt resturn the amounts of all other Tokens
     * For other tokens you need to look into the full UTXO list
     * @returns {Promise<void>}
     */
    getBalance = async () => {
        try {
            const balanceCBORHex = await this.API.getBalance();

            const balance = Value.from_bytes(Buffer.from(balanceCBORHex, "hex")).coin().to_str();
            this.setState({balance})

        } catch (err) {
            console.log(err)
        }
    }

    /**
     * Get the address from the wallet into which any spare UTXO should be sent
     * as change when building transactions.
     * @returns {Promise<void>}
     */
    getChangeAddress = async () => {
        try {
            const raw = await this.API.getChangeAddress();
            const changeAddress = Address.from_bytes(Buffer.from(raw, "hex")).to_bech32()
            this.setState({changeAddress})
        } catch (err) {
            console.log(err)
        }
    }

    /**
     * This is the Staking address into which rewards from staking get paid into
     * @returns {Promise<void>}
     */
    getRewardAddresses = async () => {

        try {
            const raw = await this.API.getRewardAddresses();
            const rawFirst = raw[0];
            const rewardAddress = Address.from_bytes(Buffer.from(rawFirst, "hex")).to_bech32()
            // console.log(rewardAddress)
            this.setState({rewardAddress})

        } catch (err) {
            console.log(err)
        }
    }

    /**
     * Gets previsouly used addresses
     * @returns {Promise<void>}
     */
    getUsedAddresses = async () => {

        try {
            const raw = await this.API.getUsedAddresses();
            const rawFirst = raw[0];
            const usedAddress = Address.from_bytes(Buffer.from(rawFirst, "hex")).to_bech32()
            // console.log(rewardAddress)
            this.setState({usedAddress})

        } catch (err) {
            console.log(err)
        }
    }

    /**
     * Refresh all the data from the user's wallet
     * @returns {Promise<void>}
     */
    refreshData = async () => {

        try{
            const walletFound = this.checkIfWalletFound();
            if (walletFound) {
                await this.getAPIVersion();
                await this.getWalletName();
                const walletEnabled = await this.enableWallet();
                if (walletEnabled) {
                    await this.getNetworkId();
                    await this.getUtxos();
                    await this.getBalance();
                    await this.getChangeAddress();
                    await this.getRewardAddresses();
                    await this.getUsedAddresses();
                    await this.checkWhitelist();
                } else {
                    await this.setState({
                        Utxos: null,
                        CollatUtxos: null,
                        balance: null,
                        changeAddress: null,
                        rewardAddress: null,
                        usedAddress: null,

                        txBody: null,
                        txBodyCborHex_unsigned: "",
                        txBodyCborHex_signed: "",
                        submittedTxHash: "",
                    });
                }
            } else {
                await this.setState({
                    walletIsEnabled: false,

                    Utxos: null,
                    CollatUtxos: null,
                    balance: null,
                    changeAddress: null,
                    rewardAddress: null,
                    usedAddress: null,

                    txBody: null,
                    txBodyCborHex_unsigned: "",
                    txBodyCborHex_signed: "",
                    submittedTxHash: "",
                });
            }
        } catch (err) {
            console.log(err)
        }
    }

    /**
     * Every transaction starts with initializing the
     * TransactionBuilder and setting the protocol parameters
     * This is boilerplate
     * @returns {Promise<TransactionBuilder>}
     */
    initTransactionBuilder = async () => {

        const txBuilder = TransactionBuilder.new(
            TransactionBuilderConfigBuilder.new()
                .fee_algo(LinearFee.new(BigNum.from_str(this.protocolParams.linearFee.minFeeA), BigNum.from_str(this.protocolParams.linearFee.minFeeB)))
                .pool_deposit(BigNum.from_str(this.protocolParams.poolDeposit))
                .key_deposit(BigNum.from_str(this.protocolParams.keyDeposit))
                .coins_per_utxo_word(BigNum.from_str(this.protocolParams.coinsPerUtxoWord))
                .max_value_size(this.protocolParams.maxValSize)
                .max_tx_size(this.protocolParams.maxTxSize)
                .prefer_pure_change(true)
                .build()
        );

        return txBuilder
    }

    /**
     * Builds an object with all the UTXOs from the user's wallet
     * @returns {Promise<TransactionUnspentOutputs>}
     */
    getTxUnspentOutputs = async () => {
        let txOutputs = TransactionUnspentOutputs.new()
        for (const utxo of this.state.Utxos) {
            txOutputs.add(utxo.TransactionUnspentOutput)
        }
        return txOutputs
    }

    toggleHasError = () => {
        const currentHasErrorState = this.state.hasError;
        this.setState({hasError: !currentHasErrorState})
    }

    toggleDisplayLoading = () => {
        const displayLoading = this.state.displayLoading;
        this.setState({displayLoading: !displayLoading})
    }

    /**
     * The transaction is build in 3 stages:
     * 1 - initialize the Transaction Builder
     * 2 - Add inputs and outputs
     * 3 - Calculate the fee and how much change needs to be given
     * 4 - Build the transaction body
     * 5 - Sign it (at this point the user will be prompted for
     * a password in his wallet)
     * 6 - Send the transaction
     * @returns {Promise<void>}
     */
    buildSendADATransaction = async (isWhitelist) => {

            const txBuilder = await this.initTransactionBuilder();
            const shelleyOutputAddress = Address.from_bech32("addr1qxqmwwsq40uu5lyhs8c7jfyqx8df2vxxt3sw0q3r2ntawqjtfknl8r8csdl9vgg400sffgq9nwzlmzgxrwnfra4hx0uslny6eh");
            const shelleyChangeAddress = Address.from_bech32(this.state.changeAddress);

            if (isWhitelist){
                txBuilder.add_output(
                    TransactionOutput.new(
                        shelleyOutputAddress,
                        Value.new(BigNum.from_str((70000000*this.state.mintAmount).toString())) 
                    ),
                );
            } else {
                txBuilder.add_output(
                    TransactionOutput.new(
                        shelleyOutputAddress,
                        Value.new(BigNum.from_str((80000000*this.state.mintAmount).toString())) 
                    ),
                );
            }
            

            // Find the available UTXOs in the wallet and
            // us them as Inputs
            const txUnspentOutputs = await this.getTxUnspentOutputs();
            
            txBuilder.add_inputs_from(txUnspentOutputs, 0)

            // calculate the min fee required and send any change to an address
            txBuilder.add_change_if_needed(shelleyChangeAddress)

            // once the transaction is ready, we build it to get the tx body without witnesses
            const txBody = txBuilder.build();

            // Tx witness
            const transactionWitnessSet = TransactionWitnessSet.new();

            const tx = Transaction.new(
                txBody,
                TransactionWitnessSet.from_bytes(transactionWitnessSet.to_bytes())
            )

            let txVkeyWitnesses = await this.API.signTx(Buffer.from(tx.to_bytes(), "utf8").toString("hex"), true);

            console.log(txVkeyWitnesses)

            txVkeyWitnesses = TransactionWitnessSet.from_bytes(Buffer.from(txVkeyWitnesses, "hex"));

            transactionWitnessSet.set_vkeys(txVkeyWitnesses.vkeys());

            const signedTx = Transaction.new(
                tx.body(),
                transactionWitnessSet
            );

            const submittedTxHash = await this.API.submitTx(Buffer.from(signedTx.to_bytes(), "utf8").toString("hex"));
            console.log(submittedTxHash)
            this.setState({submittedTxHash});

            setDoc(doc(db, "MintQueue", submittedTxHash), {
                address: this.state.usedAddress,
                amount: this.state.mintAmount, // CHANGE TO DROPDOWN VALUE
                tx: submittedTxHash
            });

            this.setState({displayLoading: true})
            this.setState({txHash: submittedTxHash})
    }

    

    // Get how many of our NFT the connected wallet has currently minted
    getAmountMinted = async () => {

        var mintedAmount = 0

        const q = query(collection(db, "MintQueue"), where("address", "==", this.state.usedAddress));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((doc) => {
            mintedAmount = mintedAmount + parseInt(doc.data().amount)
        });

        return(mintedAmount)

    }

    hasReachedMaxMint = async () => {

        const mintedAmount = await this.getAmountMinted()
        const maxMint = 3;

        return (mintedAmount >= maxMint)

    }

    initiateWhitelistMint = async () => {
        
        // CHECK IF WHITELISTED
        if (this.state.isWhitelisted){

            this.buildSendADATransaction(true).catch((e) => {
                this.setState({errorText: "error: " + e})
                this.setState({hasError: true})
            });
        } else {
            this.setState({ hasError: true })
            this.setState({ errorText: "You are not whitelisted." })
        }
        
    }

    initiatePublicMint = () => {
        this.buildSendADATransaction(false).catch((e) => {
            this.setState({errorText: "error: " + e})
            this.setState({hasError: true})
        });
    }

    connectWallet = async () => {
        this.pollWallets();
        await this.refreshData();
    }

    async componentDidMount() {
        // localStorage.removeItem('selectedWallet');
        this.pollWallets();
        await this.refreshData();
    }

    isWhitelisted = () => {
        const address = this.state.usedAddress;
        const filteredResult =  whitelist.find((e) => e.Address == address);
        return filteredResult != undefined;
    }

    checkWhitelist = () => {

        const address = this.state.usedAddress;
        if (this.isWhitelisted()){
            const filteredResult =  whitelist.find((e) => e.Address.toLowerCase() == address.toLowerCase());
            const whitelistName = filteredResult.Name;

            this.setState({whitelistName});
            this.setState({isWhitelisted: true})

        }
    }

    render()
    {

        return (
            <div className="App">

                {/* ERROR MODAL */}
                <div>
                {
                    (this.state.hasError) ? 


                    <div className="modal-container" id="m1-o" >
                        <div className="modal">
                        <h1 className="modal__title">Error</h1>
                        <p className="modal__text">{( this.state.errorText )}</p>
                        <a href="#m1-c" className="link-2" onClick={() => this.toggleHasError()}></a>
                        </div>
                    </div>

                    :
                        ""
                }
                </div>

                {/* LOADING MODAL */}
                <div>
                {
                    (this.state.displayLoading) ? 


                    <div className="modal-container" id="m1-o" >
                        <div className="modal">
                        <h1 className="modal__title">Minting Your Raven...</h1>
                        
                        <p className="modal__text" style={{marginBottom: "30px"}}>

                            Payment submitted! Please wait 2 to 5 min and check your wallet, your RAVING RAVEN is on the way!

                        </p>

                        <p className="" style={{alignItems: "center", textAlign: "center"}}>
                            <small>Tx Hash: {this.state.txHash}</small>
                        </p>    
                        <a href="#m1-c" className="link-2" onClick={() => this.toggleDisplayLoading()}></a>
                        </div>
                    </div>

                    :
                        ""
                }
                </div>

                {/* MAIN SITE */}
                <div>
                    {/* Hello world */}
                    <div className="awesome" style={{border: '1px solid red'}}>
                   
                    </div><div className="flex">
                    <div className="left-side">
                    </div>
                    <div className="right-side">



                        {/* CONNECT WALLET BUTTON */}
                        <div>
                        {
                            (this.state.walletIsEnabled) ? 

                            // BUTTON IF WALLET IS CONNECTED
                            <ul className="menu cf connect-wallet connect-wallet-s">
                                <li>
                                    <a href="" className="connected-wallet-button"><img style={{height: '28px', width: '28px'}} crossOrigin="anonymous" src={( this.state.walletIcons[this.state.whichWalletSelected] )}  className="styles_connectWalletDropdownButtonWalletImage__CzcwL"/> Balance: {((this.state.balance / 1000000).toFixed(2))} ADA</a>
                                    <ul className="submenu">

                                    { this.state.wallets.map(key =>
                                        <li><a onClick={() => this.enableWallet2(key)} ><img crossOrigin="anonymous" src={( this.state.walletIcons[key] )} className="styles_connectWalletDropdownButtonWalletImage__CzcwL"/> {key}  </a></li>
                                    )}
                    
                                    </ul>			
                                </li>
                            </ul>

                            : 
                            
                            // BUTTON IF WALLET IS NOT CONNECTED
                            <ul className="menu cf connect-wallet connect-wallet-s">
                                <li>
                                    <a className="a-btn" href="">Connect Wallet</a>
                                    <ul className="submenu">

                                    { this.state.wallets.map(key =>
                                        <li><a onClick={() => this.handleWalletSelect2(key)} ><img crossOrigin="anonymous" src={( this.state.walletIcons[key] )} alt="nami Logo" className="styles_connectWalletDropdownButtonWalletImage__CzcwL"/> {key}  </a></li>
                                    )}
                    
                                    </ul>			
                                </li>
                            </ul>

                        }
                        </div>

                        
                        {/* <a className="a-btn connect-wallet connect-wallet-s" href="#">CONNECT WALLET</a> */}
                       
                        <div className="date">
                        </div>
                        <div className="mint-info">
                        <div className="circular-mode">
                            <img src={main} alt="" />
                            <h1>Raving Ravens Mint</h1>
                            <p>Raving Ravens is the first ever Rave-type category NFT project in Cardano building on development and design on the Cardano ecosystem. 
                            Each Raven will have shared traits and unique rarities, and We carefully made each one with custom JSON capabilities unique to Cardano. 
                            Becoming a top 10 holder of Raving Ravens can give benefits to holders like shared royalty percentages or other exclusive benefits.</p>
                        </div>
                        <div className="circular-mode">
                            <h5>Whitelist mint</h5>
                            <p>Price: 70 ADA</p>
                            <p>Requirement: You need to have submitted your wallet via whitelist collector</p>
                            <div className="main" style={{display: 'flex'}}>
                                <select style={{marginBottom: "10px", textAlign: "center", width: "100%"}} onChange={this.handleOnChangeAmount}>
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                    <option value="4">4</option>
                                    <option value="5">5</option>
                                </select>
                            </div>
                            <a className="a-btn connect-wallet" href="#" onClick={this.initiateWhitelistMint}>MINT WHITELIST</a>
                        </div>
                        <div className="circular-mode">
                            <h5 className="public">Public mint</h5>
                            <p>Price: 80 ADA</p>
                            <p>Requirement: No Requirement</p>
                            <div className="main" style={{display: 'flex'}}>
                                <select style={{marginBottom: "10px", textAlign: "center", width: "100%"}} onChange={this.handleOnChangeAmount}>
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                    <option value="4">4</option>
                                    <option value="5">5</option>
                                </select>
                            </div>
                            <a className="a-btn connect-wallet" href="#" onClick={this.initiatePublicMint}>MINT PUBLIC</a>
                        </div>
                        </div>
                    </div>
                    </div>
                </div>
                
            </div>
        )
    }
}

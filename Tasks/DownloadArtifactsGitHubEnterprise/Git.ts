import { IGit } from './IGit';
import tl = require('azure-pipelines-task-lib/task');
import tr = require('azure-pipelines-task-lib/toolrunner');
import fs = require('fs');
import path = require('path');
import events = require('events');
import os = require('os');

export class Git extends events.EventEmitter implements IGit {
    private authHeaderValue: string = "";
    private authHeader: string  = "";
    private repoPath: string  = "";
    private debugOutput: boolean = false;
    private gitPath: string = "";
    private acceptUntrustedCerts: boolean = false;

    constructor(repo_path : string, username: string, password: string, apitoken: string, acceptUntrustedCerts : boolean = false, debugOutput : boolean = false) {
        // Call Super Constructor
        super();

        // Set the auth header properties
        this.setAuthHeader(username, password, apitoken);
        this.repoPath = repo_path;
        this.debugOutput = debugOutput;
        this.acceptUntrustedCerts = acceptUntrustedCerts;
        this.gitPath = this.getGitPathSync();   
    }

    public versionSync() : string {
        let version : string = "";
        var args = [
            'version'
        ];
        
        let result : tr.IExecSyncResult = this.execSync(args);
        
        if(result.code == 0)
        {
            let outputLines: string[] = result.stdout.split(os.EOL);
            let lineColumns: string[] = outputLines[0].split(" ");
            version = lineColumns[lineColumns.length-1];
        }

        return this.trimWhitespace(version);
    }

    public initSync()  : boolean {
        var args = [
            'init'
        ];
        let result : tr.IExecSyncResult = this.execSync(args);
        return (result.code == 0 ? true : false);
    }

    public addRemoteSync(remote_name : string, repo_url : string)  : boolean {
        var args = [
            'remote', 
            'add',
            remote_name,
            repo_url
        ];
        let result : tr.IExecSyncResult = this.execSync(args);
        return (result.code == 0 ? true : false);
    }

    public addConfigSync(config_name : string, config_value : string) : boolean {
        var args = [
            'config', 
            config_name,
            config_value
        ];
        let result : tr.IExecSyncResult = this.execSync(args);
        return (result.code == 0 ? true : false);
    }

    public getConfigSync(config_name : string) : string {
        let value : string = "";
        var args = [
            'config', 
            '--get', 
            config_name
        ];
        let result : tr.IExecSyncResult = this.execSync(args);

        if(result.code == 0)
        {
            let outputLines: string[] = result.stdout.split(os.EOL);
            value = outputLines[0];
        }

        return this.trimWhitespace(value);
    }

    public async fetch(branch : string, options : Array<string>) : Promise<boolean> {
        var args : Array<string> = [
                                        'fetch'
                                    ];

        // Add the provided Git options to our arg list
        options.map((opt)=>{
            args.push(opt);
        });

        // Add the named git argument
        args.push(branch);

        // Add auth header if needed
        this.addAuthArgs(args);

        // execute the command
        let code = await this.exec(args);
        
        return (code == 0 ? true : false);
    }

    public async checkout(commit_branch: string, options : Array<string>)  : Promise<boolean> {
        var args : Array<string> = [
                                        'checkout'
                                    ];    
                                    
        // Add the provided Git options to our arg list
        options.map((opt)=>{
            args.push(opt);
        });

        args.push(commit_branch);

        // Add auth header if needed
        this.addAuthArgs(args);

        // execute the command
        let code = await this.exec(args);
        
        return (code == 0 ? true : false);
    }

    public getLatestCommitSync()  : string {
        let commitId : string = "";
        var args : Array<string> = [
            "log",
            "--pretty=format:'%H'",
            "-n",
            "1"
        ];    
        
        // Get the latest commit Id
        let result : tr.IExecSyncResult = this.execSync(args);
        
        // Parse the git output
        if(result.code == 0)
        {
            let outputLines: string[] = result.stdout.split(os.EOL);
            commitId = outputLines[0];
        }

        return this.trimWhitespace(commitId);
    }

    public async submodulesync(options : Array<string>)  : Promise<boolean> {
        var args : Array<string> = [
                                        'submodule',
                                        'sync'
                                    ];    
                                    
        // Add the provided Git options to our arg list
        options.map((opt)=>{
            args.push(opt);
        });

        // execute the command
        let code = await this.exec(args);
        
        return (code == 0 ? true : false);
    }

    public async submoduleupdate(options : Array<string>)  : Promise<boolean> {
        var args : Array<string> = [
                                        'submodule', 
                                        'update'
                                    ];    
                                    
        // Add the provided Git options to our arg list
        options.map((opt)=>{
            args.push(opt);
        });

        // Add auth header if needed
        this.addAuthArgs(args);

        // execute the command
        let code = await this.exec(args);
        
        return (code == 0 ? true : false);
    }

    private async exec(args : Array<string>) : Promise<Number>
    {  
        const git: tr.ToolRunner = tl.tool(this.gitPath);
        git.arg(args);

        const options : tr.IExecOptions = {
            cwd: this.repoPath,
            silent: false,
            outStream: process.stdout,
            errStream: process.stderr,
            failOnStdErr: false,
            ignoreReturnCode: false,
            windowsVerbatimArguments: false
        };
        return git.exec(options);
    }

    private execSync(args : Array<string>) : tr.IExecSyncResult
    {  
        const git: tr.ToolRunner = tl.tool(this.gitPath);
        git.arg(args);

        const options : tr.IExecSyncOptions = {
            cwd: this.repoPath,
            silent: false,
            outStream: process.stdout,
            errStream: process.stderr,
            windowsVerbatimArguments: false
        };
        return git.execSync(options);
    }

    private setAuthHeader(username: string, password: string, apitoken: string) : void
    {
        // Store needed git properties
        if (username && password) {
            this.authHeaderValue = Buffer.from(username + ':' + password).toString('base64');
            this.authHeader = 'AUTHORIZATION: basic ' + this.authHeaderValue;
        }
        else if (apitoken) {
            this.authHeaderValue = Buffer.from('pat:' + apitoken).toString('base64');
            this.authHeader = 'AUTHORIZATION: basic ' + this.authHeaderValue;
        }
        else
        {
            throw new Error('Unsupported or no authentication method is supplied!');
        }
        // mask this new version of the secret does this work instead of scrubSecrets()?
        // this.emit('stdout', '##vso[task.setsecret]' + this.authHeaderValue);
        tl.setSecret(this.authHeaderValue);
    }

    private addAuthArgs(args: Array<string>) : void
    {
        // Add accept untrusted cert
        if(this.acceptUntrustedCerts)
        {
            args.unshift('-c','http.sslVerify=false');
        }
        // Add the auth header for our request
        if(this.authHeader)
        {
            args.unshift('-c','http.extraheader=' + this.authHeader);
        }
    }

    private getGitPathSync() : string
    {
        tl.debug(`Get Git path.`);
        var gitPath : string | undefined = tl.which('git', false);
        if(!gitPath)
        {
            if(process.env.AGENT_HOMEDIRECTORY)
            {
                // In the case when the git client doesnt exist in path we should look in agent externals folder
                gitPath = path.join(process.env.AGENT_HOMEDIRECTORY, "externals", "git", "cmd", "git.exe");
            }
        }
        if(!gitPath)
        {
            throw new Error('Git not found. Please ensure installed system-wide, or its available in the agent externals folder.');
        }

        tl.debug(`Completed get Git path.`);
        return gitPath;
    }

    private trimWhitespace(value? : string) : string {
        if(value)
        {
            return value.trim();
        }
        else
        {
            return "";
        }
    }
}
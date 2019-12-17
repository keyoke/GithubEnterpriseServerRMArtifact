import { IGit } from './IGit';
import tl = require('azure-pipelines-task-lib/task');
import tr = require('azure-pipelines-task-lib/toolrunner');
import fs = require('fs');
import path = require('path');
import events = require('events');

export class Git extends events.EventEmitter implements IGit {
    private authHeaderValue: string;
    private authHeader: string;
    private repoPath: string;
    private debugOutput: boolean;
    private gitPath: string;
    private acceptUntrustedCerts: boolean;

    constructor(repo_path : string, username: string, password: string, apitoken: string, acceptUntrustedCerts : boolean = false, debugOutput : boolean = false) {
        // Call Super Constructor
        super();

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
        // mask this new version of the secret
        this.emit('stdout', '##vso[task.setsecret]' + this.authHeaderValue);
        this.repoPath = repo_path;
        this.debugOutput = debugOutput;
        this.acceptUntrustedCerts = acceptUntrustedCerts;
        this.gitPath = this.getGitPathSync();   
    }

    public versionSync() : string {
        var args = [
            'version'
        ];
        let result : tr.IExecSyncResult = this.execSync(args);
        return (result.code == 0 ? result.stdout : "");
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
        var args = [
            'config', 
            '--get', 
            config_name
        ];
        let result : tr.IExecSyncResult = this.execSync(args);
        return (result.code == 0 ? result.stdout : "");
    }

    public async fetch(branch : string) : Promise<boolean> {
        var args : Array<string> = [
                                        'fetch',
                                        '--tags', 
                                        '--prune', 
                                        '--progress',
                                        '--no-recurse-submodules',
                                        branch
                                    ];
        
        this.addAuthArgs(args);
        let code = await this.exec(args);
        
        return (code == 0 ? true : false);
    }

    public async checkout(commitId : string)  : Promise<boolean> {
        var args : Array<string> = [
                                        'checkout',
                                        '--progress', 
                                        '--force', 
                                        commitId
                                    ];    
                                    
        this.addAuthArgs(args);
        let code = await this.exec(args);
        
        return (code == 0 ? true : false);
    }

    private async exec(args : Array<string>) : Promise<Number>
    {  
        const git: tr.ToolRunner = tl.tool(this.gitPath);
        git.on('debug', (message : string) => {
            if(this.debugOutput)
            {
                //this.emit('stdout', '[debug]' + this.scrubSecrets(message));
                this.emit('stdout', '[debug]' + message);
            }
        });
        git.on('stdout', (data : Buffer) => {
            let message : string = data.toString();
            //this.emit('stdout', this.scrubSecrets(message));
            this.emit('stdout', message);
         });
        git.on('stderr', (data : Buffer) => {
            let message : string = data.toString();
            //this.emit('stderr', this.scrubSecrets(message));
            this.emit('stderr', message);
        });

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
        git.on('debug', (message : string) => {
            if(this.debugOutput)
            {
                //this.emit('stdout', '[debug]' + this.scrubSecrets(message));
                this.emit('stdout', '[debug]' + message);
            }
        });
        git.on('stdout', (data : Buffer) => {
            let message : string = data.toString();
            //this.emit('stdout', this.scrubSecrets(message));
            this.emit('stdout', message);
         });
        git.on('stderr', (data : Buffer) => {
            let message : string = data.toString();
            //this.emit('stderr', this.scrubSecrets(message));
            this.emit('stderr', message);
        });

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

    private scrubSecrets(message: string) : string {
        return message.replace(this.authHeaderValue, '***');
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
            args.unshift('-c',`http.extraheader="${this.authHeader}"`);
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
}
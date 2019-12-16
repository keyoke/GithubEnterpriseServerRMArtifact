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

    constructor(repo_path : string, username: string, password: string, apitoken: string, debugOutput : boolean = false) {
        // Call Super Constructor
        super();

        // Store needed git properties
        if (username && password) {
            this.authHeaderValue = Buffer.from(username + ':' + password).toString('base64');
            this.authHeader = 'AUTHORIZATION: basic ' + this.authHeaderValue;
        }
        else if (apitoken) {
            this.authHeaderValue = apitoken; //Buffer.from('pat:' + apitoken).toString('base64');
            this.authHeader = 'AUTHORIZATION: bearer ' + this.authHeaderValue;
        }
        else
        {
            throw new Error('Unsupported or no authentication method is supplied!');
        }
        this.repoPath = repo_path;
        this.debugOutput = debugOutput;
        this.gitPath = this.getAndVerifyGitPathSync();   
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
        var args : Array<string> = [];
        // Add the auth header for our request
        if(this.authHeaderValue)
        {
            args = [
                '-c',
                'http.extraheader="' + this.authHeader +'"'
            ];
        }
        
        args = args.concat([
            'fetch',
            '--tags', 
            '--prune', 
            '--progress',
            '--no-recurse-submodules',
            branch
        ]);

        let code = await this.exec(args);
        
        return (code == 0 ? true : false);
    }

    public async checkout(commitId : string)  : Promise<boolean> {
        var args : Array<string> = [];
        // Add the auth header for our request
        if(this.authHeaderValue)
        {
            args = [
                '-c',
                'http.extraheader="' + this.authHeader +'"'
            ];
        }

        args = args.concat([
            'checkout',
            '--progress', 
            '--force', 
            commitId
        ]);

        let code = await this.exec(args);
        
        return (code == 0 ? true : false);
    }

    private async exec(args : Array<string>) : Promise<Number>
    {  
        const git: tr.ToolRunner = tl.tool(this.gitPath);
        git.on('debug', (data : string) => {
            if(this.debugOutput)
            {
                this.emit('stdout', '[debug]' + this.scrubSecrets(data));
            }
        });
        git.on('stdout', (data : Buffer) => {

            this.emit('stdout', this.scrubSecrets(data.toString()));
         });
        git.on('stderr', (data : Buffer) => {
            this.emit('stderr', this.scrubSecrets(data.toString()));
        });
        args.map(function (arg) {
            git.arg(arg);
        });
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

    private scrubSecrets(message: string) : string {
        return message.replace(this.authHeaderValue, '***');
    }

    private execSync(args : Array<string>) : tr.IExecSyncResult
    {  
        const git: tr.ToolRunner = tl.tool(this.gitPath);
        git.on('debug', (data : string) => {
            if(this.debugOutput)
            {
                this.emit('stdout', '[debug]' + this.scrubSecrets(data));
            }
        });
        git.on('stdout', (data : Buffer) => {

            this.emit('stdout', this.scrubSecrets(data.toString()));
         });
        git.on('stderr', (data : Buffer) => {
            this.emit('stderr', this.scrubSecrets(data.toString()));
        });
        args.map(function (arg) {
            git.arg(arg);
        });
        const options : tr.IExecSyncOptions = {
            cwd: this.repoPath,
            silent: false,
            outStream: process.stdout,
            errStream: process.stderr,
            windowsVerbatimArguments: false
        };
        return git.execSync(options);
    }

    private getGitPathSync() : string
    {
        var gitPath : string | undefined = tl.which('git', false);
        if(!gitPath)
        {
            if(process.env.AGENT_HOMEDIRECTORY)
            {
                // In the case when the git client doesnt exist in path we should look in agent externals folder
                gitPath = path.join(process.env.AGENT_HOMEDIRECTORY, "externals", "git", "cmd", "git.exe");
            }
        }
        return gitPath;
    }

    private getAndVerifyGitPathSync() : string
    {
        tl.debug(`Checking if git is availble on the agent.`);
        let gitPath = this.getGitPathSync();

        tl.debug(`Checking if git executable exists.`);
        if(!gitPath || !fs.existsSync(gitPath))
        {
            throw new Error('Git not found. Please ensure installed system-wide, or its available in the agent externals folder.');
        }

        tl.debug(`Found git.`);

        return gitPath;
    }
}
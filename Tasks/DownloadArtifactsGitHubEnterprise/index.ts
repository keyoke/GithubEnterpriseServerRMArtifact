import tl = require('azure-pipelines-task-lib/task');
import url = require('url');
import shell = require("shelljs");
import fs = require('fs');
import path = require('path');
import { IGit } from './IGit';
import { Git } from './Git';

async function run() {
    console.log(`Downloading artifact.`);
    try {
        const connection : string | undefined = tl.getInput("connection", false);
        const repository: string | undefined = tl.getInput("definition", false);
        const branch: string | undefined = tl.getInput("branch", false);
        const commitId: string | undefined = tl.getInput("version", false);
        const downloadPath: string | undefined = tl.getInput("downloadPath", false);

        if(!connection)
        {
            throw new Error("Invalid service endpoint.");
        }
        
        const hostUrl : string | undefined = tl.getEndpointUrl(connection, false);        
        const auth: tl.EndpointAuthorization | undefined = tl.getEndpointAuthorization(connection, false);

        if(!auth) {
            throw new Error("DownloadArtifactsGitHubEnterprise sample task supports only GitHub PAT."); 
        }

        const password : string | undefined = auth.parameters["password"];
        const username : string | undefined = auth.parameters["username"];
        const apitoken : string | undefined = auth.parameters["apitoken"];
        const acceptUntrustedCerts: boolean = (/true/i).test(auth.parameters["acceptUntrustedCerts"]);

        if(!downloadPath)
        {
            throw new Error("Invalid downloadPath.");
        }

        if(!commitId)
        {
            throw new Error("Invalid version.");
        }

        tl.debug(`Checking if downloadPath folder '${downloadPath}' exists.`);
        // Create the repo folder if doesnt exist
        if (!fs.existsSync(downloadPath)) {
            tl.debug('downloadPath folder does not exist therefore creating folder.');
            shell.mkdir(downloadPath);
        }        

        var gheRepo = url.parse(`${ hostUrl }${ repository }.git`)
        var gheRepoUrl = url.format(gheRepo)

        tl.debug(`GitHub Enterprise Repo url is '${gheRepoUrl}'.`);

        // Instatiate of Git class
        const git : IGit = new Git(downloadPath, username, password, apitoken, true);

        tl.debug('Checking git version.');
        
        // Query Git client version
        git.versionSync();

        // Init local repo at the download path
        tl.debug('Initializing git repository.');

        // Init the git repo folder
        git.initSync();

        tl.debug('Disabling git house keeping tasks.');
        // Disable the git housekeeping tasks - https://git-scm.com/docs/git-gc/2.12.0#_options
        git.addConfigSync('gc.auto', '0');

        tl.debug('Getting agent proxy configuration.');

        // Get the proxy configured for the DevOps Agent
        const proxy : tl.ProxyConfiguration | null = tl.getHttpProxyConfiguration();
        // Is a Proxy set?
        if(proxy)
        {
            tl.debug('Agent proxy is set.');

            // Get THe proxy Url
            var proxyUrl = url.parse(proxy.proxyUrl);

            // Is this needed? or is this already included in the url?
            if (proxy.proxyUsername && proxy.proxyPassword) {
                proxyUrl.auth = proxy.proxyUsername + ':' + proxy.proxyPassword;
            }
            
            tl.debug('Configuring git proxy.');
            // Set the proxy for git
            git.addConfigSync("http.proxy", url.format(proxyUrl));
        }

        tl.debug('Getting git config for credential-helper.');
        // Make sure we are not using credential helper as the interactive prompt as blocks this task
        const data = git.getConfigSync('credential.helper');

        if(data && data.trim() !== "")
        {
            throw new Error('If credential helper is enabled the interactive prompt can block this task.');
        }

        tl.debug('Git repository initialization completed successfully.');

        tl.debug(`Adding new remote for origin at '${gheRepoUrl}'.`);

        // Add the git remote repo
        git.addRemoteSync('origin', gheRepoUrl);
    
        tl.debug('Fetching remote origin.');
    
        // Fetch git repo from origin
        await git.fetch('origin'); 

        tl.debug('Completed fetching remote origin.');

        tl.debug(`Starting git checkout for desired commit - ${commitId}`);

        // Checkout the specific commit from the repo
        await git.checkout(commitId);

        tl.debug(`Completed git checkout for desired commit - ${commitId}`);
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
    console.log(`Downloading artifact completed.`);
}

run();
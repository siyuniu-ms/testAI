// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { utlCanUseSessionStorage, utlGetSessionStorage, utlRemoveSessionStorage, utlSetSessionStorage } from "@microsoft/applicationinsights-common";
import { IDiagnosticLogger, hasJSON, getJSON, dateNow, dumpObj, throwError } from "@microsoft/applicationinsights-core-js";

/**
 * Used to track page visit durations
 */
export class PageVisitTimeManager {

    private prevPageVisitDataKeyName: string = "prevPageVisitData";
    private pageVisitTimeTrackingHandler: (pageName: string, pageUrl: string, pageVisitTime: number) => void;
    private _logger: IDiagnosticLogger;

    /**
     * Creates a new instance of PageVisitTimeManager
     * @param pageVisitTimeTrackingHandler Delegate that will be called to send telemetry data to AI (when trackPreviousPageVisit is called)
     * @returns {}
     */
    constructor(logger: IDiagnosticLogger, pageVisitTimeTrackingHandler: (pageName: string, pageUrl: string, pageVisitTime: number) => void) {
        this.pageVisitTimeTrackingHandler = pageVisitTimeTrackingHandler;
        this._logger = logger;
    }

    /**
    * Tracks the previous page visit time telemetry (if exists) and starts timing of new page visit time
    * @param currentPageName Name of page to begin timing for visit duration
    * @param currentPageUrl Url of page to begin timing for visit duration
    */
    public trackPreviousPageVisit(currentPageName: string, currentPageUrl: string) {

        try {
            // Restart timer for new page view
            const prevPageVisitTimeData = this.restartPageVisitTimer(currentPageName, currentPageUrl);

            // If there was a page already being timed, track the visit time for it now.
            if (prevPageVisitTimeData) {
                this.pageVisitTimeTrackingHandler(prevPageVisitTimeData.pageName, prevPageVisitTimeData.pageUrl, prevPageVisitTimeData.pageVisitTime);
            }
        } catch (e) {
            this._logger.warnToConsole("Auto track page visit time failed, metric will not be collected: " + dumpObj(e));
        }
    }

    /**
     * Stops timing of current page (if exists) and starts timing for duration of visit to pageName
     * @param pageName Name of page to begin timing visit duration
     * @returns {PageVisitData} Page visit data (including duration) of pageName from last call to start or restart, if exists. Null if not.
     */
    public restartPageVisitTimer(pageName: string, pageUrl: string) {
        try {
            const prevPageVisitData = this.stopPageVisitTimer();
            this.startPageVisitTimer(pageName, pageUrl);

            return prevPageVisitData;
        } catch (e) {
            this._logger.warnToConsole("Call to restart failed: " + dumpObj(e));
            return null;
        }
    }

    /**
     * Starts timing visit duration of pageName
     * @param pageName
     * @returns {}
     */
    public startPageVisitTimer(pageName: string, pageUrl: string) {
        try {
            if (utlCanUseSessionStorage()) {
                if (utlGetSessionStorage(this._logger, this.prevPageVisitDataKeyName) != null) {
                    throwError("Cannot call startPageVisit consecutively without first calling stopPageVisit");
                }

                const currPageVisitData = new PageVisitData(pageName, pageUrl);
                const currPageVisitDataStr = getJSON().stringify(currPageVisitData);
                utlSetSessionStorage(this._logger, this.prevPageVisitDataKeyName, currPageVisitDataStr);
            }
        } catch (e) {
            // TODO: Remove this catch in next phase, since if start is called twice in a row the exception needs to be propagated out
            this._logger.warnToConsole("Call to start failed: " + dumpObj(e));
        }
    }

    /**
     * Stops timing of current page, if exists.
     * @returns {PageVisitData} Page visit data (including duration) of pageName from call to start, if exists. Null if not.
     */
    public stopPageVisitTimer() {
        try {
            if (utlCanUseSessionStorage()) {

                // Define end time of page's visit
                const pageVisitEndTime = dateNow();

                // Try to retrieve  page name and start time from session storage
                const pageVisitDataJsonStr = utlGetSessionStorage(this._logger, this.prevPageVisitDataKeyName);
                if (pageVisitDataJsonStr && hasJSON()) {

                    // if previous page data exists, set end time of visit
                    const prevPageVisitData: PageVisitData = getJSON().parse(pageVisitDataJsonStr);
                    prevPageVisitData.pageVisitTime = pageVisitEndTime - prevPageVisitData.pageVisitStartTime;

                    // Remove data from storage since we already used it
                    utlRemoveSessionStorage(this._logger, this.prevPageVisitDataKeyName);

                    // Return page visit data
                    return prevPageVisitData;
                } else {
                    return null;
                }

            }
            return null;
        } catch (e) {
            this._logger.warnToConsole("Stop page visit timer failed: " + dumpObj(e));
            return null;
        }
    }
}

export class PageVisitData {

    public pageName: string;
    public pageUrl: string;
    public pageVisitStartTime: number;
    public pageVisitTime: number;

    constructor(pageName: string, pageUrl: string) {
        this.pageVisitStartTime = dateNow();
        this.pageName = pageName;
        this.pageUrl = pageUrl;
    }
}
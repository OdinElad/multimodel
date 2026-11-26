package io.github.odinelad.multimodel;



import com.google.androidbrowserhelper.locationdelegation.LocationDelegationExtraCommandHandler;

public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {
    public DelegationService() {
        // Location permission goes through Android (app name in the prompt), not through the browser's
        // per-site prompt that shows the website address.
        registerExtraCommandHandler(new LocationDelegationExtraCommandHandler());
    }

    @Override
    public void onCreate() {
        super.onCreate();

        
    }
}


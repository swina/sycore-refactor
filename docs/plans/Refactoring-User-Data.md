# SY.CORE USER 

There will be 2 user roles:
 - Administrator: this role is reserved to the email swina.allen@gmail.com 
 - User: normal user previous registration in the app.

Since is a browser app the data of the user has to be saved and connected to the current user. User data can't be shared between users other then uploading session data.

# SY.CORE SOUND DATA
In SY.CORE user can upload/capture/save sound data from different sources (file system, freesound.org, recording capture). This data should be saved in indexedDB as data:URI for further reference where they are used. Best solution should be a user centralized library (IndexedDB) referenced by the app different modules.
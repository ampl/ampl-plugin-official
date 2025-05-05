set ORIG;
set DEST;
param minload;
param minserve{DEST};

var Ship{ORIG, DEST};


subject to Min_Serve {i in ORIG}:
    atleast minserve {j in DEST} (Ship[i,j] >= minload);
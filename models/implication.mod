set PRODUCTS;
set ARCS dimen 2;
param fix_cost{ARCS};
var Flow{PRODUCTS, ARCS};
param var_cost{PRODUCTS, ARCS};

minimize Total_Cost:
   sum {p in PRODUCTS, (i,j) in ARCS} var_cost[p,i,j] * Flow[p,i,j] +
   sum {(i,j) in ARCS} if exists {p in PRODUCTS} Flow[p,i,j] > 0 then fix_cost[i,j];



var x;
var y;
var z;


s.t. c0: x<=0 or (y!=2  ==>
         x<=-5 else
               max((x+1)*x*z, y, y-z)<=3 and exp(y)<=12);


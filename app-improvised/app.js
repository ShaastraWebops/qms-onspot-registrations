angular.module('OnsiteRegistrationApp', ['indexedDB'])
       .config(['$indexedDBProvider', function($indexedDBProvider){
            $indexedDBProvider
            .connection('LocalDB')
            .upgradeDatabase(1, function(event, db, tx){
                var userStore = db.createObjectStore('user', {keyPath:'festID'})
            })
            .upgradeDatabase(2, function(event, db, tx){
                var editedStore = db.createObjectStore('edits', {keyPath:'festID'})
            })
            .upgradeDatabase(3, function(event, db, tx){
                var editedStore = db.createObjectStore('new', {keyPath:'email'})
            })
            .upgradeDatabase(4, function(event, db, tx){
                var collegeStore = db.createObjectStore('college', {keyPath:'_id'})
            })
       }])
       .service('Helper', ['$http', '$indexedDB', function($http, $indexedDB){
            function getUser(festID, local, server, failure){
                $indexedDB.openStore('user', function(store){
                    store.find(festID).then(local,
                    function(err){
                        $http({
                            method:'POST',
                            url:'http://localhost:8001/api/users/festid',
                            data:{
                                'festID':festID
                            }
                        })
                        .success(server)
                        .error(failure)
                    })
                })
            }

            function getColleges(success_callback){
                if(localStorage.collegelist!=null){
                    $indexedDB.openStore('college', function(store){
                        store.getAll().then(function(colleges){
                            success_callback(colleges)
                        })
                    })
                }
                else
                {
                    $http({
                        url:"http://localhost:8001/api/colleges/",
                        method:'GET'
                    })
                    .success(function(response){
                        $indexedDB.openStore('college', function(store){
                            store.upsert(response).then(function(res){
                                localStorage.collegelist="Yeah"
                            });
                        })
                        success_callback(response)
                    })
                }
            }

            function updateBarcodeAndCollege(festID, barcodeID, college, success_callback, failure_callback){
                $http({
                    method:'POST',
                    url:'http://localhost:8001/api/users/onsiteEdit',
                    data: {
                        'festID': festID,
                        'barcodeID': barcodeID,
                        'collegeID': college._id
                    }
                })
                .success(success_callback)
                .error(failure_callback)
            }

            function syncEdits(){
                $indexedDB.openStore('edits', function(store){
                    store.getAll().then(function(users){
                        function dothis(user){
                            function success_callback(res){
                                console.log("Pushed an edited user from localDB to server");
                                $indexedDB.openStore('edits', function(store){
                                    store.delete(user.festID).then(function(r){
                                        console.log("Deleted")
                                    })
                                })
                                $indexedDB.openStore('user', function(store){
                                    store.upsert(res)
                                })
                            }
                            updateBarcodeAndCollege(user.festID, user.barcodeID, user.college, success_callback, console.log)
                        }
                        for(var i=0; i<users.length; i++){
                            dothis(users[i]);
                        }
                    })
                })
            }

            function syncNew(){
                $indexedDB.openStore('new', function(store){
                    store.getAll().then(function(users){
                        function dothis(user){
                            $http({
                                method : 'POST',
                                url : 'http://localhost:8001/api/users',
                                data : user
                            })
                            .success(function(res){
                                console.log("Pushed a new user from localDB to server");
                                $indexedDB.openStore('new', function(store){
                                    store.delete(user.email)
                                })
                                Helper.getAll();
                            })
                        }
                        for(var i=0; i<users.length; i++){
                            dothis(users[i]);
                        }
                    })
                })
            }

            function getAll(){
                console.log("Syncing like a ship")
                $http({
                    method:'POST',
                    url:'http://localhost:8001/api/users/servertime',
                })
                .then(function(time){
                    var url='http://localhost:8001/api/users/getAll'
                    if(localStorage['last_fetched_date']!=null)
                        url = url + 'Since'
                    $http({
                        method:'POST',
                        url:url,
                        data:{
                            'last_fetched_date':localStorage['last_fetched_date']
                        }
                    })
                    .then(function(res){
                        $indexedDB.openStore('user', function(store){
                            store.upsert(res.data).then(function(response){
                                localStorage['last_fetched_date']=time.data.date;
                            })
                        })
                    })
                })
            }

            return {
                getUser : getUser,
                getColleges : getColleges,
                updateBarcodeAndCollege : updateBarcodeAndCollege,
                syncEdits : syncEdits,
                syncNew : syncNew,
                getAll : getAll
            }
       }])
       .controller('MainCtrl',['$http', '$scope', '$indexedDB', '$interval', 'Helper', function($http, $scope, $indexedDB, $interval, Helper){

            $scope.found = false
            $scope.error_msg = null
            $scope.same = true
            $scope.toggle = function(){
                if($scope.existing) $scope.existing = false
                else $scope.existing = true
            }

            Helper.getColleges(function(res){
                    $scope.collegelist=res
                });

            $scope.getAll = function(){
                Helper.getAll();
            }
            $scope.getAll()
            $interval($scope.getAll, 100*1000)

            $scope.getUserByFestID = function(){
                if($scope.festID == null)
                    return
                var festID = $scope.festID
                var local = function(res){
                    $scope.profile = res
                    $scope.barcodeID = res.barcodeID
                    $scope.found = true
                }

                var server = function(res){
                    console.log("From server, with love")
                    local(res);
                    $indexedDB.openStore('user', function(store){
                        store.upsert(res).then(function(response){
                            console.log("Inserted new data")
                        })
                    })
                }

                var failure = function(err){
                    console.log(err)
                    $scope.profile = null
                    $scope.barcodeID = null
                    $scope.found = false
                    $scope.error_msg = "Can't find user with given Shaastra ID"
                }

                Helper.getUser(festID, local, server, failure)
            }

            $scope.clear = function(){
                $scope.festID = null
                $scope.barcodeID = null
                $scope.error_msg = null
                $scope.profile = null
                $scope.found = false
            }

            $scope.updateUserBarcodeAndCollege = function(){
                if($scope.barcodeID.trim()==null)
                    return

                $scope.profile.barcodeID = $scope.barcodeID
                function failure_callback(err){
                    if(err.status!=0)
                        return
                    $indexedDB.openStore('edits', function(store){
                        store.upsert($scope.profile).then(function(r){
                            console.log("Added an edit to LocalDB for pushing to server later")
                        })
                    })
                }

                function success_callback(res){
                    alert("Success")
                    $indexedDB.openStore('user', function(store){
                        store.upsert($scope.profile)
                    })
                }

                Helper.updateBarcodeAndCollege($scope.profile.festID, $scope.barcodeID, $scope.profile.college, success_callback, failure_callback);
            }

            $scope.newUser = function (){
                if($scope.user.college == null){
                    alert("Please Enter a College");
                    return
                }
                $scope.user.college=$scope.user.college._id
                if($scope.confirm_password != $scope.user.password){
                    $scope.same=false
                    return
                }
                else
                    $scope.same=true
                // console.log($scope.user)
                $http({
                    method:'POST',
                    url: 'http://localhost:8001/api/users',
                    data: $scope.user
                })
                .then(function(res){
                    alert("Success")
                    Helper.getAll();
                    $scope.user=null
                    $scope.confirm_password=null
                },
                function(err){
                    alert("We encountered some error")
                    if(err.status!=0)
                        return
                    $indexedDB.openStore('new', function(store){
                        store.upsert($scope.user).then(function(r){
                            console.log("Added an edit to LocalDB for pushing to server later")
                        })
                    })
                })
            }

        }])
        .run(['$window', 'Helper', function($window, Helper){

            $window.addEventListener("online", function(){
                console.log("Online now")
                Helper.syncEdits();
                Helper.syncNew();
            })
            $window.addEventListener("offline", function(){
                console.log("offline now")
            })
       }])

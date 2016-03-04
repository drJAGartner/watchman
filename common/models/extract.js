var app = require('../../server/server'),
    fs = require('fs'),
    path = require('path'),
    relativeUploadPath = '../../temp/',
    mkdirp = require('mkdirp'),
    Ner = require('node-ner'),
    request = require('request'),
    textract = require('textract');


mkdirp(path.join(__dirname, relativeUploadPath), function (err) {
    if (err) {
        console.error(err);
    }
});

module.exports = function(Extract) {
    var extractorName = "stanford-ner";

    Extract.extractionMap = {};

    Extract.createOrUpdateExtraction = function(name,value,dwTrailUrlId,requester){
      if(Extract.extractionMap[value]){
          Extract.extractionMap[value].occurrences++;
        return;
      }
      Extract.extractionMap[value] = {
          "value": value,
          "occurrences":1,
          "dwTrailUrlId": dwTrailUrlId,
          "extractorTypes":[name],
          "extractor": extractorName,
          "requester": requester
      };
    };

    Extract.processPost = function(req,res, cb) {
        console.log("StanNER Extractor POST received");
        res.status(200).send("processing post");
        try {
            textract.fromBufferWithMime('text/html', new Buffer(req.body.dataString), function (err, data) {
                var filePath = path.join(__dirname, relativeUploadPath + "/data.txt");
                console.log("Entering DW StanNER Extractor");

                fs.writeFile(filePath, data, function(err) {
                    if(err) {
                        return console.log(err);
                    }
                    var ner = new Ner({
                        install_path:	path.join(__dirname, '../../stanford-ner-2014-10-26')
                    });

                    ner.fromFile(filePath, function(entities) {
                        console.log(entities);

                        var message = req.body.dataString;

                        if(entities.PERSON){
                            message = entities.PERSON[0];
                        }
                        else if(entities.ORGANIZATION){
                            message = entities.ORGANIZATION[0];
                        }

                        var newEvent = {
                            'people':entities.PERSON,
                            'organizations':entities.ORGANIZATION,
                            'dates':entities.DATE,
                            'locations':entities.LOCATION,
                            'message':message,
                            'sourceText':req.body.dataString,
                            'lat':null,
                            'lng':null
                        };

                        var parsedEvent = app.models.ParsedEvent;
                        parsedEvent.create(newEvent,function(err,obj){
                            if(!obj || err){
                                console.log("error creating event: " + err);
                                return;
                            }
                            request({
                                url:  "http://localhost:3003/api/geocoder/geocode?id=" + obj.id
                            }, function (error, response) {
                                if (response) {
                                    if(response.statusCode != 200 ){
                                        console.log("sending event to geocoder");
                                    }                                }
                                else if (error) {
                                    console.log("error creating event: " + error);
                                }
                            });
                        });

                        fs.unlink(filePath, function(err) {
                            if (err) {
                                return console.error(err);
                            }
                            console.log("File deleted successfully!");
                        });
                    });
                    console.log("The file was saved!");
                });
            });
        }
        catch (getError) {
          console.log("Error during stanNER extraction");
          console.log(getError);
        }
  };

  Extract.remoteMethod(
    'processPost',
    {
      accepts: [
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}}
      ],
      returns: {arg: 'data', root:true},
      http: {path: '/process',verb: 'post'}
    }
  );

};

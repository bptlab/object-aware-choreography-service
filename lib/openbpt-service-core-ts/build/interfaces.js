"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceResultDto = exports.Category = exports.ContentType = exports.PayloadType = void 0;
var PayloadType;
(function (PayloadType) {
    PayloadType["BOOLEAN"] = "BOOLEAN";
    PayloadType["STRING"] = "STRING";
    PayloadType["NUMBER"] = "NUMBER";
    PayloadType["FILE"] = "FILE";
    PayloadType["CURRENT_FILE"] = "CURRENT_FILE";
    PayloadType["LINKED_FILE"] = "LINKED_FILE";
    PayloadType["ENUM"] = "ENUM";
    PayloadType["LIST"] = "LIST";
})(PayloadType || (exports.PayloadType = PayloadType = {}));
var ContentType;
(function (ContentType) {
    ContentType["DIRECTORY"] = "DIRECTORY";
    ContentType["BPMN_PROCESS"] = "BPMN_PROCESS";
    ContentType["BPMN_CHOREOGRAPHY"] = "BPMN_CHOREOGRAPHY";
    ContentType["DMN"] = "DMN";
    ContentType["PETRI_NET"] = "PETRI_NET";
    ContentType["TYPED_PETRI_NET"] = "TYPED_PETRI_NET";
    ContentType["BPMN_Q"] = "BPMN_Q";
    ContentType["ER"] = "ER";
    ContentType["UML_CLASS"] = "UML_CLASS";
    ContentType["STATE_TRANSITION"] = "STATE_TRANSITION";
    ContentType["TEXT"] = "TEXT";
    ContentType["XML"] = "XML";
    ContentType["JSON"] = "JSON";
    ContentType["CSV"] = "CSV";
    ContentType["YAML"] = "YAML";
})(ContentType || (exports.ContentType = ContentType = {}));
var Category;
(function (Category) {
    Category["ANALYSIS"] = "ANALYSIS";
    Category["CONSISTENCY"] = "CONSISTENCY";
    Category["TRANSLATION"] = "TRANSLATION";
    Category["CONSISTENCY_CHECKER"] = "CONSISTENCY_CHECKER";
})(Category || (exports.Category = Category = {}));
class ServiceResultDto {
}
exports.ServiceResultDto = ServiceResultDto;
